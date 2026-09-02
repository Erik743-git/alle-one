/**
 * Desativa 2FA de um usuário direto no banco (sem código TOTP).
 * Use só em ambiente de teste / recuperação operacional.
 *
 * Uso:
 *   cd backend
 *   npx ts-node prisma/scripts/disable-user-2fa.ts --email=seu@email.com
 *   npx ts-node prisma/scripts/disable-user-2fa.ts --email=seu@email.com --dry-run
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const emailArg = process.argv.find((a) => a.startsWith('--email='));
  const email = emailArg?.split('=')[1]?.trim().toLowerCase();
  if (!email) {
    throw new Error('Informe --email=<usuario>');
  }

  const user = await prisma.user.findFirst({
    where: {
      email: { equals: email, mode: 'insensitive' },
      deletedAt: null,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      totpEnabledAt: true,
      totpSecretEncrypted: true,
    },
  });

  if (!user) {
    throw new Error(`Usuário não encontrado: ${email}`);
  }

  console.log(
    JSON.stringify(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        totpEnabledAt: user.totpEnabledAt,
        hasSecret: Boolean(user.totpSecretEncrypted),
      },
      null,
      2,
    ),
  );

  if (!user.totpEnabledAt && !user.totpSecretEncrypted) {
    console.log('2FA já está desativado para este usuário.');
    return;
  }

  if (dryRun) {
    console.log('[dry-run] Não alterou o banco.');
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      totpEnabledAt: null,
      totpSecretEncrypted: null,
      totpBackupCodesHash: null,
    },
  });

  console.log('2FA desativado. Faça logout/login de novo no navegador.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
