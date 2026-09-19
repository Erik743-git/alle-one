import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService, type SendMailAttachment } from './mail.service';

export const EMAIL_TEMPLATE_KEYS = {
  TICKET_REGISTERED: 'TICKET_REGISTERED',
  GMUD_NOTIFY: 'GMUD_NOTIFY',
  APPOINTMENT_CLIENT_NOTIFY: 'APPOINTMENT_CLIENT_NOTIFY',
  ROUTINE_TICKET_CLOSED: 'ROUTINE_TICKET_CLOSED',
  TICKET_CLOSED: 'TICKET_CLOSED',
} as const;

export type EmailTemplateKey =
  (typeof EMAIL_TEMPLATE_KEYS)[keyof typeof EMAIL_TEMPLATE_KEYS];

const DEFAULTS: Array<{
  key: EmailTemplateKey;
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
}> = [
  {
    key: EMAIL_TEMPLATE_KEYS.TICKET_REGISTERED,
    name: 'Chamado registrado',
    subject: 'Seu chamado foi registrado com o numero {{ticketNumber}}',
    bodyHtml:
      '<p>Olá {{requestorName}} da empresa {{companyName}}.</p><p>Recebemos sua solicitação de atendimento.</p><p><strong>#{{ticketNumber}} - {{title}}</strong></p><p>Data/hora de abertura: {{openedAt}}</p><p>Nossa equipe está trabalhando para realizar seu atendimento o mais rápido possível.</p><p>Atenciosamente.<br/>Alle Tecnologia.</p>',
    bodyText:
      'Olá {{requestorName}} da empresa {{companyName}}.\n\nRecebemos sua solicitação de atendimento.\n\n#{{ticketNumber}} - {{title}}\nData/hora de abertura: {{openedAt}}\n\nNossa equipe está trabalhando para realizar seu atendimento o mais rápido possível.\n\nAtenciosamente.\nAlle Tecnologia.',
  },
  {
    key: EMAIL_TEMPLATE_KEYS.GMUD_NOTIFY,
    name: 'GMUD aguardando aprovação',
    subject: 'GMUD #{{gmudCode}} aguardando aprovação',
    bodyHtml:
      '<p>A GMUD <strong>#{{gmudCode}}</strong> está aguardando sua aprovação.</p><p><strong>Empresa:</strong> {{companyName}}</p><p><a href="{{gmudLink}}">Acessar GMUD no portal</a></p>',
    bodyText:
      'A GMUD #{{gmudCode}} está aguardando sua aprovação.\n\nEmpresa: {{companyName}}\n\nAcesse: {{gmudLink}}\n',
  },
  {
    key: EMAIL_TEMPLATE_KEYS.APPOINTMENT_CLIENT_NOTIFY,
    name: 'Comunicação com cliente (apontamento)',
    subject:
      'Atualização do chamado #{{ticketNumber}} — {{appointmentDate}} {{appointmentTime}}',
    bodyHtml:
      '<p>Olá.</p><p>Há um apontamento de comunicação no chamado <strong>#{{ticketNumber}} — {{ticketTitle}}</strong>.</p><p><strong>Quem apontou:</strong> {{authorName}}<br/><strong>Quando:</strong> {{appointmentDate}} {{appointmentTime}}</p><p><strong>Descrição do apontamento</strong></p><div>{{appointmentDescriptionHtml}}</div><p><strong>Descrição do chamado</strong></p><div>{{ticketDescriptionHtml}}</div>{{attachmentsNote}}<p>Atenciosamente.<br/>Alle Tecnologia.</p>',
    bodyText:
      'Olá.\n\nHá um apontamento de comunicação no chamado #{{ticketNumber}} — {{ticketTitle}}.\n\nQuem apontou: {{authorName}}\nQuando: {{appointmentDate}} {{appointmentTime}}\n\nDescrição do apontamento:\n{{appointmentDescriptionText}}\n\nDescrição do chamado:\n{{ticketDescriptionText}}\n\nAtenciosamente.\nAlle Tecnologia.\n',
  },
  {
    key: EMAIL_TEMPLATE_KEYS.ROUTINE_TICKET_CLOSED,
    name: 'Chamado de rotina concluído',
    subject: 'Chamado #{{ticketNumber}} concluído — {{title}}',
    bodyHtml:
      '<p>Olá {{requestorName}}.</p><p>O chamado de rotina <strong>#{{ticketNumber}} — {{title}}</strong> foi concluído em {{closedAt}}.</p><p>Situação: <strong>{{stageName}}</strong></p><p>Atenciosamente.<br/>Alle Tecnologia.</p>',
    bodyText:
      'Olá {{requestorName}}.\n\nO chamado de rotina #{{ticketNumber}} — {{title}} foi concluído em {{closedAt}}.\n\nSituação: {{stageName}}\n\nAtenciosamente.\nAlle Tecnologia.\n',
  },
  {
    // O número no assunto é o que liga a resposta do cliente de volta ao
    // chamado: responder este e-mail vira comunicação e reabre o chamado.
    key: EMAIL_TEMPLATE_KEYS.TICKET_CLOSED,
    name: 'Chamado concluído',
    subject: 'Chamado #{{ticketNumber}} concluído — {{title}}',
    bodyHtml:
      '<p>Olá {{requestorName}}.</p><p>O chamado <strong>#{{ticketNumber}} — {{title}}</strong> foi concluído em {{closedAt}}.</p><p>Situação: <strong>{{stageName}}</strong><br/>Atendimento: {{responsibleName}}</p><p>Se ainda precisar de algo neste chamado, basta responder este e-mail: ele volta para a nossa fila.</p><p>Atenciosamente.<br/>Alle Tecnologia.</p>',
    bodyText:
      'Olá {{requestorName}}.\n\nO chamado #{{ticketNumber}} — {{title}} foi concluído em {{closedAt}}.\n\nSituação: {{stageName}}\nAtendimento: {{responsibleName}}\n\nSe ainda precisar de algo neste chamado, basta responder este e-mail: ele volta para a nossa fila.\n\nAtenciosamente.\nAlle Tecnologia.\n',
  },
];

function renderTemplate(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return template.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_, key: string) => {
      const value = vars[key];
      return value == null ? '' : String(value);
    },
  );
}

@Injectable()
export class EmailTemplatesService {
  private readonly logger = new Logger(EmailTemplatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async ensureDefaults() {
    for (const row of DEFAULTS) {
      await this.prisma.emailTemplate.upsert({
        where: { key: row.key },
        create: row,
        update: {},
      });
    }
  }

  async list() {
    await this.ensureDefaults();
    return this.prisma.emailTemplate.findMany({
      orderBy: { key: 'asc' },
    });
  }

  async update(
    key: string,
    data: {
      subject?: string;
      bodyHtml?: string;
      bodyText?: string;
      name?: string;
    },
  ) {
    await this.ensureDefaults();
    const existing = await this.prisma.emailTemplate.findUnique({
      where: { key },
    });
    if (!existing) {
      throw new NotFoundException(`Template ${key} não encontrado.`);
    }
    return this.prisma.emailTemplate.update({
      where: { key },
      data: {
        ...(data.name != null ? { name: data.name.trim() } : {}),
        ...(data.subject != null ? { subject: data.subject.trim() } : {}),
        ...(data.bodyHtml != null ? { bodyHtml: data.bodyHtml } : {}),
        ...(data.bodyText != null ? { bodyText: data.bodyText } : {}),
      },
    });
  }

  async getRendered(
    key: EmailTemplateKey,
    vars: Record<string, string | number | null | undefined>,
  ) {
    await this.ensureDefaults();
    const row = await this.prisma.emailTemplate.findUnique({ where: { key } });
    if (!row) {
      throw new NotFoundException(`Template ${key} não encontrado.`);
    }
    return {
      subject: renderTemplate(row.subject, vars),
      html: renderTemplate(row.bodyHtml, vars),
      text: renderTemplate(row.bodyText, vars),
    };
  }

  async sendTicketRegistered(params: {
    to: string;
    cc?: string[];
    ticketNumber: number;
    title: string;
    requestorName: string | null;
    companyName: string | null;
    openedAt: Date;
  }) {
    const to = params.to.trim();
    if (!to) return false;

    const openedAt = params.openedAt.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    });

    const rendered = await this.getRendered(
      EMAIL_TEMPLATE_KEYS.TICKET_REGISTERED,
      {
        ticketNumber: params.ticketNumber,
        title: params.title,
        requestorName: params.requestorName?.trim() || 'cliente',
        companyName: params.companyName?.trim() || '',
        openedAt,
      },
    );

    try {
      return await this.mail.sendMail({
        to,
        cc: params.cc?.length ? params.cc : undefined,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });
    } catch (err) {
      this.logger.warn(
        `Falha ao enviar TICKET_REGISTERED #${params.ticketNumber}: ${
          err instanceof Error ? err.message : err
        }`,
      );
      return false;
    }
  }

  /** Chamado de rotina: único e-mail, só para o solicitante, no fechamento. */
  async sendRoutineTicketClosed(params: {
    to: string;
    ticketNumber: number;
    title: string;
    requestorName: string | null;
    stageName: string;
    closedAt: Date;
  }) {
    const to = params.to.trim();
    if (!to) return false;

    const rendered = await this.getRendered(
      EMAIL_TEMPLATE_KEYS.ROUTINE_TICKET_CLOSED,
      {
        ticketNumber: params.ticketNumber,
        title: params.title,
        requestorName: params.requestorName?.trim() || 'cliente',
        stageName: params.stageName,
        closedAt: params.closedAt.toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
        }),
      },
    );

    try {
      return await this.mail.sendMail({
        to,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });
    } catch (err) {
      this.logger.warn(
        `Falha ao enviar ROUTINE_TICKET_CLOSED #${params.ticketNumber}: ${
          err instanceof Error ? err.message : err
        }`,
      );
      return false;
    }
  }

  async sendTicketClosed(params: {
    to: string;
    ticketNumber: number;
    title: string;
    requestorName: string | null;
    stageName: string;
    responsibleName: string | null;
    closedAt: Date;
  }) {
    const to = params.to.trim();
    if (!to) return false;

    const rendered = await this.getRendered(EMAIL_TEMPLATE_KEYS.TICKET_CLOSED, {
      ticketNumber: params.ticketNumber,
      title: params.title,
      requestorName: params.requestorName?.trim() || 'cliente',
      stageName: params.stageName,
      responsibleName: params.responsibleName?.trim() || 'equipe Alle',
      closedAt: params.closedAt.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
      }),
    });

    try {
      return await this.mail.sendMail({
        to,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });
    } catch (err) {
      this.logger.warn(
        `Falha ao enviar TICKET_CLOSED #${params.ticketNumber}: ${
          err instanceof Error ? err.message : err
        }`,
      );
      return false;
    }
  }

  async sendGmudNotify(params: {
    to: string[];
    gmudCode: number;
    gmudId: string;
    companyName: string;
  }) {
    const portalUrl = process.env.PORTAL_PUBLIC_URL ?? 'http://localhost:3000';
    const gmudLink = `${portalUrl}/gmud/${params.gmudId}`;
    const rendered = await this.getRendered(EMAIL_TEMPLATE_KEYS.GMUD_NOTIFY, {
      gmudCode: params.gmudCode,
      companyName: params.companyName,
      gmudLink,
    });
    try {
      return await this.mail.sendMail({
        to: params.to,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });
    } catch (err) {
      this.logger.warn(
        `Falha ao enviar GMUD_NOTIFY #${params.gmudCode}: ${
          err instanceof Error ? err.message : err
        }`,
      );
      return false;
    }
  }

  async sendAppointmentClientNotify(params: {
    to: string[];
    cc?: string[];
    ticketNumber: number;
    ticketTitle: string;
    authorName: string;
    appointmentDate: string;
    appointmentTime: string;
    appointmentDescriptionHtml: string;
    appointmentDescriptionText: string;
    ticketDescriptionHtml: string;
    ticketDescriptionText: string;
    attachmentsNote?: string;
    attachments?: SendMailAttachment[];
  }) {
    let to = uniqueEmails(params.to);
    let cc = uniqueEmails(params.cc ?? []).filter(
      (email) => !to.includes(email),
    );
    if (to.length === 0 && cc.length > 0) {
      to = [cc[0]];
      cc = cc.slice(1);
    }
    if (to.length === 0) {
      this.logger.warn(
        `APPOINTMENT_CLIENT_NOTIFY #${params.ticketNumber}: nenhum destinatário.`,
      );
      return false;
    }

    const rendered = await this.getRendered(
      EMAIL_TEMPLATE_KEYS.APPOINTMENT_CLIENT_NOTIFY,
      {
        ticketNumber: params.ticketNumber,
        ticketTitle: params.ticketTitle,
        authorName: params.authorName,
        appointmentDate: params.appointmentDate,
        appointmentTime: params.appointmentTime,
        appointmentDescriptionHtml: params.appointmentDescriptionHtml,
        appointmentDescriptionText: params.appointmentDescriptionText,
        ticketDescriptionHtml: params.ticketDescriptionHtml,
        ticketDescriptionText: params.ticketDescriptionText,
        attachmentsNote: params.attachmentsNote ?? '',
      },
    );

    try {
      return await this.mail.sendMail({
        to,
        cc: cc.length ? cc : undefined,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        attachments: params.attachments,
      });
    } catch (err) {
      this.logger.warn(
        `Falha ao enviar APPOINTMENT_CLIENT_NOTIFY #${params.ticketNumber}: ${
          err instanceof Error ? err.message : err
        }`,
      );
      return false;
    }
  }
}

function uniqueEmails(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const email = raw.trim().toLowerCase();
    if (!email || !email.includes('@') || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}
