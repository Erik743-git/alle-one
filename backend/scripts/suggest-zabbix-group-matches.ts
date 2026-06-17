/**
 * Lista sugestões de vínculo empresa ↔ grupo Zabbix e opcionalmente aplica.
 *
 * Uso:
 *   npx ts-node -r tsconfig-paths/register scripts/suggest-zabbix-group-matches.ts
 *   npx ts-node -r tsconfig-paths/register scripts/suggest-zabbix-group-matches.ts --apply
 *   npx ts-node -r tsconfig-paths/register scripts/suggest-zabbix-group-matches.ts --all
 */
import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { CompaniesService } from '../src/modules/companies/companies.service';

config();

const args = new Set(process.argv.slice(2));
const shouldApply = args.has('--apply');
const includeValid = args.has('--all');

async function resolveScriptActor() {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst({
      where: { role: 'ADMIN', deletedAt: null, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        role: true,
        companyId: true,
      },
    });

    if (!user) {
      throw new Error('Nenhum usuário ADMIN ativo encontrado para auditoria.');
    }

    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      permissions: [],
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const companiesService = app.get(CompaniesService);
    const result = await companiesService.suggestZabbixGroupMatches({
      onlyInvalid: !includeValid,
    });

    console.log(`Grupos no Zabbix: ${result.groupsAvailable}`);
    console.log(`Sugestões: ${result.suggestions.length}\n`);

    if (!result.suggestions.length) {
      return;
    }

    for (const item of result.suggestions) {
      console.log(
        `- ${item.companyName}\n` +
          `    atual: ${item.currentGroup ?? '—'}\n` +
          `    sugerido: ${item.suggestedGroup} (score ${item.score}, ${item.reason})`,
      );
    }

    if (!shouldApply) {
      console.log('\nDry-run. Use --apply para gravar no banco.');
      return;
    }

    const actor = await resolveScriptActor();
    const applyResult = await companiesService.applyZabbixGroupSuggestions(
      actor,
      result.suggestions.map((item) => ({
        companyId: item.companyId,
        zabbixGroupName: item.suggestedGroup,
      })),
    );

    console.log(
      `\nAplicados: ${applyResult.applied} de ${applyResult.total}`,
    );

    for (const row of applyResult.results) {
      if (!row.applied) {
        console.log(`  ! ${row.companyName}: ${row.message ?? 'falhou'}`);
      }
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
