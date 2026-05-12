require("dotenv").config({ path: ".env" });

const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    const clientId = 979136; // Coopermil
    const ranges = [
      ["2026-04-01", "2026-04-13"],
      ["2026-01-07", "2026-04-13"],
    ];

    for (const [s, e] of ranges) {
      const startDateOnly = s;
      const endDateOnly = e;

      const [countRow] =
        (await prisma.$queryRaw`
          select
            count(*)::int as appointments,
            count(distinct a.ticket_number)::int as distinct_tickets
          from tiflux.ticket_appointments a
          inner join tiflux.tickets t
            on t.ticket_number = a.ticket_number
          where t.client_external_id = ${clientId}
            and a.appointment_date between ${startDateOnly}::date and ${endDateOnly}::date
        `) ?? [];

      const appointments = countRow?.appointments ?? 0;
      const distinctTickets = countRow?.distinct_tickets ?? 0;

      console.log(
        "range",
        s,
        e,
        "appointments",
        appointments,
        "distinctTickets",
        distinctTickets,
      );
    }

    const sample =
      (await prisma.$queryRaw`
        select
          a.ticket_number,
          a.appointment_date::text as appointment_date,
          a.init_time::text as init_time,
          a.end_time::text as end_time,
          a.description,
          a.valorization_raw
        from tiflux.ticket_appointments a
        inner join tiflux.tickets t
          on t.ticket_number = a.ticket_number
        where t.client_external_id = ${clientId}
          and a.appointment_date between ${"2026-04-01"}::date and ${"2026-04-13"}::date
        order by a.appointment_date asc, a.external_id asc
        limit 10
      `) ?? [];

    console.log("sample", JSON.stringify(sample, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

