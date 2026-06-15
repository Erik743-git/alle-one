import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'fs';

const prisma = new PrismaClient();
const rows = await prisma.portalTicketAppointmentAttachment.findMany({
  include: { file: true },
});

let updated = 0;
for (const row of rows) {
  if (!row.file.mimeType.startsWith('image/')) continue;
  if (!existsSync(row.file.path)) continue;
  const buffer = readFileSync(row.file.path);
  if (buffer.length < 12) continue;
  await prisma.$executeRaw`
    UPDATE portal_ticket_appointment_attachments
    SET preview_data_base64 = ${buffer.toString('base64')}
    WHERE id = ${row.id}
      AND preview_data_base64 IS NULL
  `;
  updated += 1;
}

console.log(`Previews gravados no banco: ${updated}`);
await prisma.$disconnect();
