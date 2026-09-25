import { Injectable, Logger } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import {
  UPLOAD_MAX_BYTES,
  assertAllowedUpload,
} from '../../common/upload.config';
import { PrismaService } from '../../prisma/prisma.service';
import { htmlParaTexto } from '../email-inbound/html-para-texto';
import {
  MicrosoftGraphMailClient,
  PORTAL_SENT_HEADER,
  type GraphMailMessage,
} from '../email-inbound/microsoft-graph-mail.client';
import { OportunidadesService, ehConteudoAtivo } from './oportunidades.service';

/** Quantos e-mails recentes a leitura olha a cada volta (a mais recente primeiro). */
const E_MAILS_POR_LEITURA = 40;
/** Evento que marca uma resposta já lida (guarda o Message-ID em `para`). */
const EVENTO_RESPOSTA = 'EMAIL_RESPOSTA';

export type ResultadoLeitura = {
  lidos: number;
  criados: number;
  respostas: number;
};

/** Título do card a partir do assunto, sem RE:/ENC:/FW: na frente. */
export function tituloDoAssunto(assunto: string | null | undefined): string {
  const limpo = (assunto ?? '')
    .replace(/^(\s*(re|res|enc|fw|fwd|tr)\s*:\s*)+/i, '')
    .trim();
  return (limpo || '(sem assunto)').slice(0, 200);
}

/**
 * Anexos que viram anexo do card: só os de verdade.
 *
 * Imagem colada no corpo (assinatura, logo do rodapé) vem marcada como
 * inline ou é citada no HTML por cid:. Essas ficam de fora, como combinado.
 */
export function anexosAproveitaveis<
  T extends {
    name: string;
    contentType?: string;
    size?: number;
    contentId?: string | null;
    isInline?: boolean;
  },
>(anexos: T[], corpoHtml: string): T[] {
  const corpo = corpoHtml.toLowerCase();
  return anexos.filter((a) => {
    if (a.isInline) return false;
    const cid = a.contentId?.replace(/[<>]/g, '').trim().toLowerCase();
    if (cid && corpo.includes(`cid:${cid}`)) return false;
    if (ehConteudoAtivo(a.contentType, a.name)) return false;
    if (a.size != null && a.size > UPLOAD_MAX_BYTES) return false;
    return true;
  });
}

/**
 * Lê a caixa de oportunidades (Microsoft 365) e cria os cards.
 *
 * - E-mail novo vira card em Pendente, com o remetente como solicitante.
 * - Resposta a uma oportunidade que já existe (mesma conversa, ou assunto com
 *   "Oportunidade #N") não vira card nem texto: só os anexos entram no card.
 * - Só entra o que chegou depois que a leitura foi ligada.
 * - Aviso que o próprio portal mandou e voltou para a caixa é ignorado.
 */
@Injectable()
export class OportunidadesEmailService {
  private readonly logger = new Logger(OportunidadesEmailService.name);
  private avisouSemGraph = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: MicrosoftGraphMailClient,
    private readonly oportunidades: OportunidadesService,
  ) {}

  async lerCaixa(): Promise<ResultadoLeitura> {
    const vazio = { lidos: 0, criados: 0, respostas: 0 };
    const cfg = await this.prisma.oportunidadeConfig.findUnique({
      where: { id: 'default' },
    });
    if (!cfg?.leituraAtiva || !cfg.caixaEmail) return vazio;

    // Mesmas credenciais do Azure da caixa de chamados.
    const inbound = await this.prisma.emailInboundSettings.findUnique({
      where: { id: 'default' },
    });
    const auth = {
      tenantId: inbound?.graphTenantId,
      clientId: inbound?.graphClientId,
    };
    if (!this.graph.isConfigured(auth)) {
      if (!this.avisouSemGraph) {
        this.logger.warn(
          'Leitura de oportunidades ligada, mas o acesso ao Microsoft 365 não está configurado.',
        );
        this.avisouSemGraph = true;
      }
      return vazio;
    }

    const mensagens = await this.graph.listRecentMessages({
      mailbox: cfg.caixaEmail,
      top: E_MAILS_POR_LEITURA,
      ...auth,
    });
    const desde = cfg.leituraDesde?.getTime() ?? Date.now();
    const resultado = { ...vazio };

    // Da mais antiga para a mais nova: resposta que chega junto com o
    // e-mail original encontra o card já criado.
    for (const msg of [...mensagens].reverse()) {
      if (
        msg.receivedDateTime &&
        new Date(msg.receivedDateTime).getTime() < desde
      )
        continue;
      resultado.lidos += 1;
      try {
        const feito = await this.processar(msg, cfg.caixaEmail, auth);
        if (feito === 'CRIADO') resultado.criados += 1;
        if (feito === 'RESPOSTA') resultado.respostas += 1;
      } catch (err) {
        this.logger.warn(
          `E-mail de oportunidade não processado (${msg.internetMessageId ?? msg.id}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    await this.prisma.oportunidadeConfig.update({
      where: { id: 'default' },
      data: { ultimaLeituraEm: new Date() },
    });
    return resultado;
  }

  private async processar(
    msg: GraphMailMessage,
    caixa: string,
    auth: { tenantId?: string | null; clientId?: string | null },
  ): Promise<'CRIADO' | 'RESPOSTA' | 'IGNORADO'> {
    const messageId = (
      msg.internetMessageId?.trim() || `graph:${msg.id}`
    ).slice(0, 500);
    const remetente =
      msg.from?.emailAddress?.address?.trim().toLowerCase() ?? '';

    const cabecalho = (nome: string) =>
      msg.internetMessageHeaders?.find(
        (h) => h.name?.toLowerCase() === nome.toLowerCase(),
      )?.value ?? null;
    if (cabecalho(PORTAL_SENT_HEADER) !== null) return 'IGNORADO';
    if (!remetente || remetente === caixa.toLowerCase()) return 'IGNORADO';

    // Já lido antes (card criado ou resposta aproveitada)?
    const jaCard = await this.prisma.oportunidade.findUnique({
      where: { emailMessageId: messageId },
      select: { id: true },
    });
    if (jaCard) return 'IGNORADO';
    const jaResposta = await this.prisma.oportunidadeEvento.findFirst({
      where: { tipo: EVENTO_RESPOSTA, para: messageId },
      select: { id: true },
    });
    if (jaResposta) return 'IGNORADO';

    const corpoHtml = msg.body?.content ?? '';
    const uploader = await this.quemSobeOsArquivos(remetente);

    // Resposta a uma oportunidade existente: só os anexos entram.
    const existente = await this.cardDaConversa(msg);
    if (existente) {
      const n = await this.copiarAnexos(
        msg,
        caixa,
        auth,
        existente.id,
        uploader,
        corpoHtml,
      );
      await this.prisma.oportunidadeEvento.create({
        data: {
          oportunidadeId: existente.id,
          tipo: EVENTO_RESPOSTA,
          para: messageId,
        },
      });
      if (n > 0) {
        await this.prisma.oportunidade.update({
          where: { id: existente.id },
          data: { ultimaMovimentacao: new Date() },
        });
      }
      return 'RESPOSTA';
    }

    // E-mail novo: vira card em Pendente.
    const usuario = await this.prisma.user.findFirst({
      where: {
        email: { equals: remetente, mode: 'insensitive' },
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        companyId: true,
      },
    });
    const ehCliente =
      usuario?.role === UserRole.CLIENT ||
      usuario?.role === UserRole.CLIENT_GESTOR ||
      usuario?.role === UserRole.CLIENT_MEMBER;
    const texto =
      msg.body?.contentType?.toLowerCase() === 'html'
        ? htmlParaTexto(corpoHtml)
        : corpoHtml || msg.bodyPreview || '';

    const card = await this.prisma.oportunidade.create({
      data: {
        titulo: tituloDoAssunto(msg.subject),
        descricao: texto.trim().slice(0, 20000),
        origem: 'EMAIL',
        solicitanteUserId: usuario?.id ?? null,
        solicitanteNome: (
          usuario?.name ||
          msg.from?.emailAddress?.name ||
          remetente
        ).slice(0, 200),
        solicitanteEmail: remetente,
        // Cliente do portal que mandou e-mail já traz a empresa dele.
        companyId: ehCliente ? (usuario?.companyId ?? null) : null,
        emailMessageId: messageId,
        emailConversationId: msg.conversationId?.slice(0, 500) ?? null,
        eventos: { create: { tipo: 'CRIADA', para: 'PENDENTE' } },
      },
    });
    await this.copiarAnexos(msg, caixa, auth, card.id, uploader, corpoHtml);
    const completo = await this.oportunidades.obterParaAviso(card.id);
    await this.oportunidades.avisarComercialNova(completo);
    return 'CRIADO';
  }

  /** Card da mesma conversa, ou citado no assunto ("Oportunidade #12"). */
  private async cardDaConversa(msg: GraphMailMessage) {
    if (msg.conversationId) {
      const porConversa = await this.prisma.oportunidade.findFirst({
        where: { emailConversationId: msg.conversationId, deletedAt: null },
        select: { id: true },
      });
      if (porConversa) return porConversa;
    }
    const numero = /oportunidade\s*#\s*(\d{1,9})/i.exec(msg.subject ?? '')?.[1];
    if (numero) {
      return this.prisma.oportunidade.findFirst({
        where: { numero: Number(numero), deletedAt: null },
        select: { id: true },
      });
    }
    return null;
  }

  private async copiarAnexos(
    msg: GraphMailMessage,
    caixa: string,
    auth: { tenantId?: string | null; clientId?: string | null },
    oportunidadeId: string,
    uploader: string | null,
    corpoHtml: string,
  ): Promise<number> {
    if (!msg.hasAttachments || !uploader) return 0;
    const metas = await this.graph.listAttachmentsMeta({
      mailbox: caixa,
      graphMessageId: msg.id,
      ...auth,
    });
    let copiados = 0;
    for (const meta of anexosAproveitaveis(metas, corpoHtml)) {
      try {
        const arq = await this.graph.downloadAttachment({
          mailbox: caixa,
          graphMessageId: msg.id,
          attachmentId: meta.id,
          ...auth,
        });
        const mime =
          arq.contentType || meta.contentType || 'application/octet-stream';
        // Mesma validação dos anexos enviados pelo portal.
        assertAllowedUpload({
          mimetype: mime,
          buffer: arq.contentBytes,
          originalname: arq.name,
        });
        await this.oportunidades.guardarArquivo(
          oportunidadeId,
          uploader,
          arq.name,
          mime,
          arq.contentBytes,
        );
        copiados += 1;
      } catch (err) {
        this.logger.warn(
          `Anexo "${meta.name}" ignorado: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return copiados;
  }

  /** O arquivo precisa de um dono: o remetente, se for usuário; senão o primeiro admin. */
  private async quemSobeOsArquivos(remetente: string): Promise<string | null> {
    const usuario = await this.prisma.user.findFirst({
      where: {
        email: { equals: remetente, mode: 'insensitive' },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (usuario) return usuario.id;
    const admin = await this.prisma.user.findFirst({
      where: { role: UserRole.ADMIN, deletedAt: null },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return admin?.id ?? null;
  }
}
