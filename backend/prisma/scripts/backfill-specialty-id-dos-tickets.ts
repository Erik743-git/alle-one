/**
 * Preenche `portal_tickets.specialty_id` a partir do nome da mesa gravado em
 * `desk_name`.
 *
 * Os chamados trazidos na carga inicial ficaram só com o texto da mesa, sem a
 * ligação com `specialties`. Quem depende dessa ligação enxerga vazio — o
 * escopo do Terceiro (papel PJ) filtra por empresa **e** mesa pelo id, então
 * sem isso ele não vê os chamados que atende.
 *
 * Uso (na VM, pasta backend, com o .env do ambiente):
 *   npx ts-node prisma/scripts/backfill-specialty-id-dos-tickets.ts
 *   npx ts-node prisma/scripts/backfill-specialty-id-dos-tickets.ts --aplicar
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');

type Linha = { mesa: string; total: bigint; specialty_id: string | null };

async function main() {
  // Uma linha por mesa: quantos chamados estão sem id e se o nome casa.
  const linhas = await prisma.$queryRaw<Linha[]>`
    SELECT btrim(t.desk_name) AS mesa,
           count(*) AS total,
           max(s.id::text) AS specialty_id
    FROM portal_tickets t
    LEFT JOIN specialties s
           ON lower(btrim(s.name)) = lower(btrim(t.desk_name))
          AND s.deleted_at IS NULL
    WHERE t.specialty_id IS NULL
      AND btrim(coalesce(t.desk_name, '')) <> ''
    GROUP BY 1
    ORDER BY count(*) DESC
  `;

  if (linhas.length === 0) {
    console.log('Nada a fazer: todo chamado com mesa já tem specialty_id.');
    return;
  }

  const casam = linhas.filter((l) => l.specialty_id);
  const orfas = linhas.filter((l) => !l.specialty_id);

  console.log('Mesas que casam com uma especialidade cadastrada:');
  for (const l of casam) {
    console.log(`  ${l.mesa}: ${l.total} chamado(s)`);
  }
  if (orfas.length > 0) {
    console.log('\nSem especialidade correspondente (ficam como estão):');
    for (const l of orfas) {
      console.log(`  ${l.mesa}: ${l.total} chamado(s)`);
    }
  }

  const totalCasam = casam.reduce((acc, l) => acc + Number(l.total), 0);
  if (!aplicar) {
    console.log(
      `\nSimulação: ${totalCasam} chamado(s) seriam atualizados. Rode com --aplicar para gravar.`,
    );
    return;
  }

  // Um UPDATE só: o join casa pelo nome, ignorando caixa e espaços.
  const atualizados = await prisma.$executeRaw`
    UPDATE portal_tickets t
    SET specialty_id = s.id
    FROM specialties s
    WHERE t.specialty_id IS NULL
      AND btrim(coalesce(t.desk_name, '')) <> ''
      AND lower(btrim(s.name)) = lower(btrim(t.desk_name))
      AND s.deleted_at IS NULL
  `;
  console.log(`\n${atualizados} chamado(s) atualizados.`);

  const restam = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*) AS n FROM portal_tickets WHERE specialty_id IS NULL
  `;
  console.log(`Ainda sem specialty_id: ${restam[0]?.n ?? 0}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
