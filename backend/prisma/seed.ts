import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const isProd = process.env.NODE_ENV === 'production';
  const envPlain = process.env.ADMIN_SEED_PASSWORD?.trim();

  if (isProd) {
    if (!envPlain || envPlain.length < 12) {
      throw new Error(
        'Em produção defina ADMIN_SEED_PASSWORD com no mínimo 12 caracteres antes de rodar o seed.',
      );
    }
  }

  const plain = envPlain ?? (isProd ? '' : '123456');
  if (!plain) {
    throw new Error('ADMIN_SEED_PASSWORD ausente.');
  }

  if (!isProd && !envPlain) {
    // eslint-disable-next-line no-console
    console.warn(
      '[seed] ADMIN_SEED_PASSWORD não definido; usando senha padrão de desenvolvimento (nunca em produção).',
    );
  }

  const password = await bcrypt.hash(plain, 10);

  let alleCompany = await prisma.company.findFirst({
    where: {
      email: 'contato@alletecnologia.com',
    },
  });

  if (!alleCompany) {
    alleCompany = await prisma.company.create({
      data: {
        name: 'Alle Tecnologia',
        responsibleName: 'Erik Manarin',
        email: 'contato@alletecnologia.com',
        status: true,
      },
    });
  } else {
    alleCompany = await prisma.company.update({
      where: {
        id: alleCompany.id,
      },
      data: {
        name: 'Alle Tecnologia',
        responsibleName: 'Erik Manarin',
        email: 'contato@alletecnologia.com',
        status: true,
      },
    });
  }

  await prisma.user.upsert({
    where: {
      email: 'admin@alle.com',
    },
    update: {
      name: 'Erik Manarin',
      passwordHash: password,
      role: 'ADMIN',
      status: 'ACTIVE',
      firstAccess: false,
      companyId: alleCompany.id,
    },
    create: {
      name: 'Erik Manarin',
      email: 'admin@alle.com',
      passwordHash: password,
      role: 'ADMIN',
      status: 'ACTIVE',
      firstAccess: false,
      companyId: alleCompany.id,
    },
  });

  console.log(
    'Empresa Alle Tecnologia e usuário admin configurados com sucesso.',
  );
}

main()
  .catch((error) => {
    console.error(error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
