/**
 * Marca todos os usuários internos da Alle como responsáveis e vincula cada um
 * a todas as especialidades ativas.
 *
 * "Interno" = usuário ACTIVE, não excluído, com papel de atendimento
 * (ADMIN, COLLABORATOR ou PJ) e e-mail no domínio da Alle. Os papéis de
 * cliente ficam de fora sempre: marcá-los como responsável os tornaria
 * atribuíveis como dono de chamado.
 *
 * NUNCA remove vínculo nem desmarca ninguém — só acrescenta.
 *
 * Por padrão NÃO grava nada: é preciso passar --apply.
 *
 * Uso:
 *   cd backend
 *   npx ts-node prisma/scripts/link-internal-users-to-all-specialties.ts
 *   npx ts-node prisma/scripts/link-internal-users-to-all-specialties.ts --excluir="Infra - Teste,Alleone"
 *   npx ts-node prisma/scripts/link-internal-users-to-all-specialties.ts --apply
 *
 * Flags:
 *   --apply           grava de verdade (sem ela, só lista)
 *   --dominio=x.com   domínio considerado interno (padrão alletecnologia.com)
 *   --excluir="A,B"   especialidades a deixar de fora, pelo nome exato
 */
import { PrismaClient, UserRole, UserStatus } from '@prisma/client';

const prisma = new PrismaClient();

const apply = process.argv.includes('--apply');

function textoDaFlag(nome: string, padrao: string): string {
  const bruto = process.argv.find((a) => a.startsWith(`--${nome}=`));
  if (!bruto) return padrao;
  return bruto.slice(`--${nome}=`.length).trim() || padrao;
}

const dominio = textoDaFlag('dominio', 'alletecnologia.com').toLowerCase();
const excluidas = new Set(
  textoDaFlag('excluir', '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

async function main() {
  console.log(
    `Parâmetros: domínio=@${dominio}, modo=${apply ? 'APLICAR' : 'somente listar'}`,
  );
  if (excluidas.size > 0) {
    console.log(`Especialidades excluídas: ${[...excluidas].join(', ')}`);
  }

  const todasEspecialidades = await prisma.specialty.findMany({
    where: { deletedAt: null, active: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const especialidades = todasEspecialidades.filter(
    (s) => !excluidas.has(s.name.trim().toLowerCase()),
  );

  console.log(
    `Especialidades alvo (${especialidades.length}): ${especialidades
      .map((s) => s.name)
      .join(', ')}`,
  );
  if (especialidades.length === 0) return;

  const usuarios = await prisma.user.findMany({
    where: {
      deletedAt: null,
      status: UserStatus.ACTIVE,
      // Papéis de cliente nunca entram: seriam atribuíveis como dono de
      // chamado, o que não é o mesmo que "todo mundo da Alle".
      role: { in: [UserRole.ADMIN, UserRole.COLLABORATOR, UserRole.PJ] },
      email: { endsWith: `@${dominio}`, mode: 'insensitive' },
    },
    select: {
      id: true,
      name: true,
      email: true,
      responsible: true,
      specialtyId: true,
      userSpecialties: { select: { specialtyId: true } },
    },
    orderBy: { name: 'asc' },
  });

  console.log(`Usuários internos: ${usuarios.length}\n`);
  if (usuarios.length === 0) return;

  const aMarcar: string[] = [];
  const aVincular: Array<{ userId: string; specialtyId: string }> = [];
  const semEspecialidadePrincipal: string[] = [];

  for (const u of usuarios) {
    const jaTem = new Set(u.userSpecialties.map((us) => us.specialtyId));
    if (u.specialtyId) jaTem.add(u.specialtyId);

    const faltando = especialidades.filter((s) => !jaTem.has(s.id));
    const precisaFlag = !u.responsible;

    if (!precisaFlag && faltando.length === 0) continue;

    const partes: string[] = [];
    if (precisaFlag) {
      aMarcar.push(u.id);
      partes.push('marcar como responsável');
    }
    if (faltando.length > 0) {
      partes.push(`+${faltando.length} mesa(s): ${faltando.map((s) => s.name).join(', ')}`);
      for (const s of faltando) {
        aVincular.push({ userId: u.id, specialtyId: s.id });
      }
    }
    if (!u.specialtyId) semEspecialidadePrincipal.push(u.id);

    console.log(`${u.name} <${u.email}>`);
    console.log(`  ${partes.join(' | ')}`);
  }

  console.log(
    `\nResumo: ${aMarcar.length} usuário(s) a marcar como responsável, ` +
      `${aVincular.length} vínculo(s) novo(s).`,
  );

  if (aMarcar.length === 0 && aVincular.length === 0) {
    console.log('Nada a fazer — todos já estão marcados e vinculados.');
    return;
  }

  if (!apply) {
    console.log('Nada foi gravado. Rode de novo com --apply para aplicar.');
    return;
  }

  if (aMarcar.length > 0) {
    const r = await prisma.user.updateMany({
      where: { id: { in: aMarcar } },
      data: { responsible: true },
    });
    console.log(`Marcados responsible=true: ${r.count}`);
  }

  if (aVincular.length > 0) {
    const r = await prisma.userSpecialty.createMany({
      data: aVincular,
      skipDuplicates: true,
    });
    console.log(`Vínculos criados: ${r.count}`);
  }

  // `users.specialty_id` é o campo legado ainda lido em vários pontos; deixá-lo
  // vazio faria o usuário sumir de telas que não consultam a tabela de vínculo.
  for (const userId of semEspecialidadePrincipal) {
    const primeira = await prisma.userSpecialty.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { specialtyId: true },
    });
    if (primeira) {
      await prisma.user.update({
        where: { id: userId },
        data: { specialtyId: primeira.specialtyId },
      });
    }
  }
  if (semEspecialidadePrincipal.length > 0) {
    console.log(
      `Especialidade principal preenchida em ${semEspecialidadePrincipal.length} usuário(s).`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
