/**
 * Testa o envio pelo Microsoft Graph sem ligar MAIL_TRANSPORT=graph.
 *
 * Uso (na pasta backend):
 *   npx ts-node prisma/scripts/test-graph-mail.ts destinatario@dominio.com
 *
 * Usa o mesmo aplicativo da caixa de entrada (tenant/cliente da configuração
 * de e-mail no banco, secret em GRAPH_CLIENT_SECRET) e a mesma caixa
 * remetente que o portal usaria.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { MicrosoftGraphMailClient } from '../../src/modules/email-inbound/microsoft-graph-mail.client';
import {
  parseMailAddress,
  parseMailAddressList,
} from '../../src/modules/mail/mail-address.util';

function envTrim(value: string | undefined) {
  const t = value?.trim().replace(/^(['"])(.*)\1$/, '$2').trim();
  return t || undefined;
}

async function main() {
  const to = parseMailAddressList(process.argv[2]);
  if (to.length === 0) {
    console.error('Informe o destinatário: ... test-graph-mail.ts voce@dominio.com');
    process.exit(2);
  }

  const from = parseMailAddress(envTrim(process.env.MAIL_FROM) ?? '');
  const mailbox =
    envTrim(process.env.MAIL_GRAPH_SENDER) ??
    from?.address ??
    envTrim(process.env.SMTP_USER);
  if (!mailbox) {
    console.error('Sem caixa remetente: defina MAIL_GRAPH_SENDER ou MAIL_FROM.');
    process.exit(2);
  }

  const prisma = new PrismaClient();
  try {
    const settings = await prisma.emailInboundSettings.findUnique({
      where: { id: 'default' },
      select: { graphTenantId: true, graphClientId: true },
    });
    const auth = {
      tenantId: settings?.graphTenantId,
      clientId: settings?.graphClientId,
    };
    const graph = new MicrosoftGraphMailClient();
    console.log(
      `remetente: ${mailbox} | destino: ${to.map((r) => r.address).join(', ')} | aplicativo configurado: ${graph.isConfigured(auth) ? 'sim' : 'NAO'}`,
    );
    if (!graph.isConfigured(auth)) process.exit(1);

    await graph.sendMail(
      {
        mailbox,
        fromName: from?.name ?? null,
        to,
        subject: 'Teste de envio do Alle One (Microsoft Graph)',
        text: 'Se você recebeu esta mensagem, o envio pelo Microsoft Graph está funcionando.',
        html: '<p>Se você recebeu esta mensagem, o envio pelo <strong>Microsoft Graph</strong> está funcionando.</p>',
      },
      auth,
    );
    console.log('ENVIO OK — confira a caixa do destinatário.');
  } catch (err) {
    console.error('FALHOU:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
