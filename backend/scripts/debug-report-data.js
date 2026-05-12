const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    const company = await prisma.company.findFirst({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, tifluxClientId: true },
    });

    console.log("company:", company);

    if (!company?.tifluxClientId) {
      console.log("company sem tifluxClientId");
      return;
    }

    const start = process.argv[2] ?? "2026-04-18";
    const end = process.argv[3] ?? "2026-04-25";

    const rows = await prisma.$queryRaw`
      select count(*)::int as n
      from tiflux.ticket_appointments a
      inner join tiflux.tickets t on t.ticket_number = a.ticket_number
      where t.client_external_id = ${company.tifluxClientId}
        and a.appointment_date between ${start}::date and ${end}::date
    `;

    console.log("appointments_in_range:", rows);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

