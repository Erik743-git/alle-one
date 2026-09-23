/**
 * Põe o modelo enxuto de "Comunicação com cliente (apontamento)" no ar.
 *
 * O ensureDefaults() só cria o modelo quando ele não existe (`update: {}`),
 * para nunca passar por cima do que alguém ajustou na tela de E-mail. Por
 * isso mudar o padrão no código não muda nada em ambiente já rodando — é
 * este script que aplica.
 *
 * Uso (na pasta backend):
 *   npx ts-node --transpile-only prisma/scripts/atualizar-template-comunicacao.ts            # só mostra
 *   npx ts-node --transpile-only prisma/scripts/atualizar-template-comunicacao.ts --aplicar  # aplica
 *
 * Trava de segurança: só sobrescreve se o que está gravado for o texto
 * antigo que veio do código. Se alguém tiver editado o modelo na tela, o
 * script avisa e não mexe — a edição da pessoa vale mais que o padrão.
 * Use --forcar para sobrescrever mesmo assim.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const APLICAR = process.argv.includes('--aplicar');
const FORCAR = process.argv.includes('--forcar');
const KEY = 'APPOINTMENT_CLIENT_NOTIFY';

const ANTIGO_SUBJECT =
  'Atualização do chamado #{{ticketNumber}} — {{appointmentDate}} {{appointmentTime}}';

const NOVO = {
  subject: 'Chamado #{{ticketNumber}} — {{ticketTitle}}',
  bodyHtml:
    '<p>Olá.</p><div>{{appointmentDescriptionHtml}}</div>{{attachmentsNote}}<p>{{authorName}} — Alle Tecnologia<br/><span style="color:#64748b">Chamado #{{ticketNumber}} · {{appointmentDate}} {{appointmentTime}}</span></p>',
  bodyText:
    'Olá.\n\n{{appointmentDescriptionText}}\n\n{{authorName}} — Alle Tecnologia\nChamado #{{ticketNumber}} · {{appointmentDate}} {{appointmentTime}}\n',
};

async function main() {
  const prisma = new PrismaClient();
  try {
    const atual = await prisma.emailTemplate.findUnique({ where: { key: KEY } });
    if (!atual) {
      console.log(
        `Modelo ${KEY} ainda não existe no banco. Nada a fazer: o ensureDefaults() vai criá-lo já no formato novo.`,
      );
      return;
    }

    if (atual.subject === NOVO.subject) {
      console.log('O modelo já está no formato novo. Nada a fazer.');
      return;
    }

    const intocado = atual.subject === ANTIGO_SUBJECT;
    if (!intocado && !FORCAR) {
      console.log('O modelo foi editado na tela de E-mail. Não vou sobrescrever.');
      console.log(`Assunto gravado: ${atual.subject}`);
      console.log('Se quiser trocar mesmo assim, rode de novo com --forcar.');
      return;
    }

    console.log('Assunto atual:', atual.subject);
    console.log('Assunto novo :', NOVO.subject);
    if (!APLICAR) {
      console.log('\nNada foi gravado. Rode com --aplicar para valer.');
      return;
    }

    await prisma.emailTemplate.update({ where: { key: KEY }, data: NOVO });
    console.log('\nModelo atualizado.');
  } finally {
    await prisma.$disconnect();
  }
}

void main();
