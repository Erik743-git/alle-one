/**
 * Recupera a descrição dos chamados que nasceram cortados em 255 caracteres.
 *
 * O ingest montava a descrição em texto a partir do `bodyPreview` do Graph,
 * limitado a 255 caracteres, então todo chamado aberto de e-mail em HTML
 * guardou só o começo da mensagem. O corpo inteiro ficou em
 * `pre_tickets.description_html` e nunca foi usado.
 *
 * Aqui a descrição é remontada a partir desse HTML com `htmlParaTexto`, o
 * mesmo conversor que os chamados novos usam — assim o texto recuperado sai
 * idêntico ao que sairia se o chamado fosse aberto hoje.
 *
 * Não toca em chamado cuja descrição já foi editada à mão: se o texto atual
 * não for prefixo do que o e-mail original geraria, o chamado é pulado e
 * aparece no relatório para decisão humana.
 *
 * Uso:
 *   cd backend
 *   npx ts-node prisma/scripts/recuperar-descricoes-cortadas.ts            # dry-run
 *   npx ts-node prisma/scripts/recuperar-descricoes-cortadas.ts --apply    # grava
 *   npx ts-node prisma/scripts/recuperar-descricoes-cortadas.ts --ticket=81743
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { htmlParaTexto } from '../../src/modules/email-inbound/html-para-texto';

const prisma = new PrismaClient();

/** O corte do bodyPreview fica nessa faixa; acima disso não foi ele. */
const CORTE_MIN = 200;
const CORTE_MAX = 256;

type Linha = {
  ticket_number: number;
  atual: string;
  html: string | null;
};

/** Compara ignorando espaço, que o conversor antigo colapsava de outro jeito. */
function normalizar(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim().toLowerCase();
}

async function main() {
  const apply = process.argv.includes('--apply');
  const alvo = process.argv
    .find((a) => a.startsWith('--ticket='))
    ?.split('=')[1];
  const ticketFiltro = alvo ? Number(alvo) : null;

  const linhas = await prisma.$queryRaw<Linha[]>`
    SELECT d.ticket_number, d.description AS atual, p.description_html AS html
    FROM portal_ticket_descriptions d
    JOIN pre_tickets p ON p.ticket_number = d.ticket_number
    WHERE p.description_html IS NOT NULL
      AND (${ticketFiltro}::int IS NULL OR d.ticket_number = ${ticketFiltro}::int)
      AND (
        ${ticketFiltro}::int IS NOT NULL
        OR length(d.description) BETWEEN ${CORTE_MIN} AND ${CORTE_MAX}
      )
    ORDER BY d.ticket_number
  `;

  console.log(
    `${linhas.length} chamado(s) candidato(s)${apply ? '' : ' — dry-run, nada será gravado'}.\n`,
  );

  let gravados = 0;
  const pulados: string[] = [];

  for (const linha of linhas) {
    const novo = htmlParaTexto(linha.html);

    if (!novo) {
      pulados.push(`#${linha.ticket_number}: HTML não gerou texto`);
      continue;
    }
    if (novo.length <= linha.atual.length) {
      pulados.push(
        `#${linha.ticket_number}: o HTML não tem mais texto que o atual`,
      );
      continue;
    }
    // O texto atual precisa ser o começo do que o e-mail geraria. Se não for,
    // alguém editou a descrição à mão e sobrescrever apagaria esse trabalho.
    if (!normalizar(novo).startsWith(normalizar(linha.atual))) {
      pulados.push(
        `#${linha.ticket_number}: descrição atual não bate com o e-mail (editada à mão?)`,
      );
      continue;
    }

    console.log(
      `#${linha.ticket_number}: ${linha.atual.length} → ${novo.length} caracteres`,
    );
    console.log(`   antes: …${linha.atual.slice(-60)}`);
    console.log(`   agora: …${novo.slice(-60)}\n`);

    if (apply) {
      await prisma.$executeRaw`
        UPDATE portal_ticket_descriptions
           SET description = ${novo}
         WHERE ticket_number = ${linha.ticket_number}
      `;
      gravados++;
    }
  }

  if (pulados.length > 0) {
    console.log('Pulados:');
    for (const p of pulados) console.log(`  ${p}`);
    console.log('');
  }

  console.log(
    apply
      ? `${gravados} descrição(ões) regravada(s).`
      : 'Dry-run: rode de novo com --apply para gravar.',
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
