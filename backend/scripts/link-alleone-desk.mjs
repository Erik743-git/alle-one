import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const TARGET_EXTERNAL_ID = Number(process.env.TIFLUX_PORTAL_DESK_ID ?? 85478);

const prisma = new PrismaClient();

try {
  const portalDesk = await prisma.serviceDesk.findFirst({
    where: { name: { equals: 'Alleone', mode: 'insensitive' }, deletedAt: null },
    select: { id: true, name: true, externalId: true },
  });

  if (!portalDesk) {
    throw new Error('Mesa portal Alleone não encontrada.');
  }

  const conflict = await prisma.serviceDesk.findFirst({
    where: {
      externalId: TARGET_EXTERNAL_ID,
      deletedAt: null,
      NOT: { id: portalDesk.id },
    },
    select: { id: true, name: true, externalId: true },
  });

  if (conflict) {
    throw new Error(
      `externalId ${TARGET_EXTERNAL_ID} já usado por "${conflict.name}".`,
    );
  }

  const updated = await prisma.serviceDesk.update({
    where: { id: portalDesk.id },
    data: { externalId: TARGET_EXTERNAL_ID },
    select: { id: true, name: true, externalId: true },
  });

  console.log('Vinculado:', updated);
} finally {
  await prisma.$disconnect();
}
