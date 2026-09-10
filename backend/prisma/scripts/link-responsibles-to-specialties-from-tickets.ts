/**
 * Vincula responsáveis às especialidades em que eles de fato atenderam,
 * deduzindo a partir do histórico de `portal_tickets`.
 *
 * Para cada usuário ACTIVE com `responsible = true`, olha os chamados em que
 * ele consta como responsável, agrupa pela mesa do chamado, converte a mesa em
 * especialidade (`specialties.external_id`) e cria o vínculo que faltar.
 *
 * NUNCA remove vínculo existente — só acrescenta. A tela de usuários substitui
 * o conjunto inteiro ao salvar, então remoção aqui apagaria curadoria manual.
 *
 * Por padrão NÃO grava nada: é preciso passar --apply. O contrário (gravar por
 * padrão e simular com --dry-run) já causou escrita não intencional quando a
 * versão em produção era antiga e ignorou a flag desconhecida.
 *
 * Uso:
 *   cd backend
 *   npx ts-node prisma/scripts/link-responsibles-to-specialties-from-tickets.ts
 *   npx ts-node prisma/scripts/link-responsibles-to-specialties-from-tickets.ts --min=5 --meses=24
 *   npx ts-node prisma/scripts/link-responsibles-to-specialties-from-tickets.ts --apply
 *
 * Flags:
 *   --apply     grava de verdade (sem ela, só lista)
 *   --min=N     mínimo de chamados naquela mesa para criar o vínculo (padrão 3)
 *   --meses=N   janela de histórico considerada; 0 = tudo (padrão 12)
 */
import { PrismaClient, UserStatus } from '@prisma/client';
import { normalizeMatchName } from '../../src/modules/admin/portal-tiflux-once.import';
import { portalResponsibleSyntheticId } from '../../src/modules/tickets/portal-responsible.helper';

const prisma = new PrismaClient();

const apply = process.argv.includes('--apply');

function numeroDaFlag(nome: string, padrao: number): number {
  const bruto = process.argv.find((a) => a.startsWith(`--${nome}=`));
  if (!bruto) return padrao;
  const n = Number(bruto.split('=')[1]);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : padrao;
}

const minChamados = numeroDaFlag('min', 3);
const meses = numeroDaFlag('meses', 12);

type TicketRow = {
  desk_external_id: number | null;
  responsible_external_id: number | null;
  responsible_name: string | null;
  qtd: bigint;
};

async function main() {
  console.log(
    `Parâmetros: min=${minChamados} chamado(s) por mesa, janela=${
      meses === 0 ? 'todo o histórico' : `${meses} meses`
    }, modo=${apply ? 'APLICAR' : 'somente listar'}`,
  );

  // Especialidades ativas, indexadas pela mesa TiFlux.
  const especialidades = await prisma.specialty.findMany({
    where: { deletedAt: null, active: true, externalId: { not: null } },
    select: { id: true, name: true, externalId: true },
  });
  const porMesa = new Map<number, { id: string; name: string }>();
  for (const e of especialidades) {
    if (e.externalId != null) porMesa.set(e.externalId, { id: e.id, name: e.name });
  }
  console.log(`Especialidades com mesa TiFlux: ${porMesa.size}`);

  // Responsáveis ativos e seus vínculos atuais.
  const usuarios = await prisma.user.findMany({
    where: { deletedAt: null, status: UserStatus.ACTIVE, responsible: true },
    select: {
      id: true,
      name: true,
      email: true,
      specialtyId: true,
      userSpecialties: { select: { specialtyId: true } },
    },
  });
  console.log(`Responsáveis ativos: ${usuarios.length}`);

  // Duas chaves de casamento, ambas do lado do portal: o id sintético derivado
  // do UUID e o nome normalizado. O id do TiFlux, quando existe, já foi gravado
  // em responsible_external_id pelo próprio portal.
  const porIdSintetico = new Map<number, (typeof usuarios)[number]>();
  const porNome = new Map<string, (typeof usuarios)[number]>();
  const nomesAmbiguos = new Set<string>();
  for (const u of usuarios) {
    porIdSintetico.set(portalResponsibleSyntheticId(u.id), u);
    const chave = normalizeMatchName(u.name);
    if (porNome.has(chave)) nomesAmbiguos.add(chave);
    porNome.set(chave, u);
  }
  for (const chave of nomesAmbiguos) porNome.delete(chave);
  if (nomesAmbiguos.size > 0) {
    console.log(
      `Nomes repetidos ignorados no casamento por nome: ${nomesAmbiguos.size}`,
    );
  }

  const desde =
    meses === 0
      ? null
      : new Date(Date.now() - meses * 30 * 24 * 60 * 60 * 1000);

  const linhas = await prisma.$queryRawUnsafe<TicketRow[]>(
    `
    SELECT desk_external_id, responsible_external_id, responsible_name, count(*) AS qtd
    FROM portal_tickets
    WHERE desk_external_id IS NOT NULL
      AND (responsible_external_id IS NOT NULL OR responsible_name IS NOT NULL)
      ${desde ? 'AND coalesce(updated_at_source, created_at_source, created_at) >= $1' : ''}
    GROUP BY desk_external_id, responsible_external_id, responsible_name
    `,
    ...(desde ? [desde] : []),
  );
  console.log(`Combinações mesa/responsável no histórico: ${linhas.length}`);

  // usuário -> especialidade -> quantidade de chamados
  const contagem = new Map<string, Map<string, number>>();
  let semUsuario = 0;
  let semEspecialidade = 0;

  for (const linha of linhas) {
    const mesa = linha.desk_external_id;
    if (mesa == null) continue;
    const especialidade = porMesa.get(mesa);
    if (!especialidade) {
      semEspecialidade += Number(linha.qtd);
      continue;
    }

    const usuario =
      (linha.responsible_external_id != null
        ? porIdSintetico.get(linha.responsible_external_id)
        : undefined) ??
      (linha.responsible_name
        ? porNome.get(normalizeMatchName(linha.responsible_name))
        : undefined);

    if (!usuario) {
      semUsuario += Number(linha.qtd);
      continue;
    }

    if (!contagem.has(usuario.id)) contagem.set(usuario.id, new Map());
    const doUsuario = contagem.get(usuario.id)!;
    doUsuario.set(
      especialidade.id,
      (doUsuario.get(especialidade.id) ?? 0) + Number(linha.qtd),
    );
  }

  if (semUsuario > 0) {
    console.log(
      `Chamados cujo responsável não casou com nenhum usuário responsável ativo: ${semUsuario}`,
    );
  }
  if (semEspecialidade > 0) {
    console.log(`Chamados em mesa sem especialidade ativa: ${semEspecialidade}`);
  }

  const nomeEspecialidade = new Map(
    especialidades.map((e) => [e.id, e.name] as const),
  );

  const aCriar: Array<{ userId: string; specialtyId: string }> = [];
  let usuariosAfetados = 0;

  for (const usuario of usuarios) {
    const doUsuario = contagem.get(usuario.id);
    if (!doUsuario) continue;

    const jaTem = new Set<string>(
      usuario.userSpecialties.map((us) => us.specialtyId),
    );
    if (usuario.specialtyId) jaTem.add(usuario.specialtyId);

    const novos = [...doUsuario.entries()]
      .filter(([specialtyId, qtd]) => qtd >= minChamados && !jaTem.has(specialtyId))
      .sort((a, b) => b[1] - a[1]);

    if (novos.length === 0) continue;

    usuariosAfetados += 1;
    console.log(`\n${usuario.name} <${usuario.email}>`);
    console.log(
      `  já vinculado: ${
        [...jaTem].map((id) => nomeEspecialidade.get(id) ?? id).sort().join(', ') ||
        '(nenhuma)'
      }`,
    );
    for (const [specialtyId, qtd] of novos) {
      console.log(
        `  + ${nomeEspecialidade.get(specialtyId) ?? specialtyId} (${qtd} chamado(s))`,
      );
      aCriar.push({ userId: usuario.id, specialtyId });
    }
  }

  console.log(
    `\nResumo: ${aCriar.length} vínculo(s) novo(s) em ${usuariosAfetados} usuário(s).`,
  );

  if (aCriar.length === 0) return;

  if (!apply) {
    console.log('Nada foi gravado. Rode de novo com --apply para aplicar.');
    return;
  }

  const resultado = await prisma.userSpecialty.createMany({
    data: aCriar,
    skipDuplicates: true,
  });
  console.log(`Vínculos criados: ${resultado.count}`);

  // Quem não tinha especialidade primária ganha a mais antiga como legado,
  // mantendo `users.specialty_id` coerente com a tabela de vínculo.
  for (const usuario of usuarios) {
    if (usuario.specialtyId) continue;
    if (!aCriar.some((v) => v.userId === usuario.id)) continue;
    const primeira = await prisma.userSpecialty.findFirst({
      where: { userId: usuario.id },
      orderBy: { createdAt: 'asc' },
      select: { specialtyId: true },
    });
    if (primeira) {
      await prisma.user.update({
        where: { id: usuario.id },
        data: { specialtyId: primeira.specialtyId },
      });
    }
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
