require("dotenv").config({ path: ".env" });

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function hhmm(minutes) {
  const total = Math.trunc(Number(minutes) || 0);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

async function main() {
  const clientId = Number(process.argv[2] ?? 2145953);
  const start = process.argv[3] ?? "2026-04-01";
  const end = process.argv[4] ?? "2026-04-30";

  const [company] =
    (await prisma.$queryRaw`
      select id, name, zabbix_group_name, tiflux_client_id, tiflux_client_name
      from companies
      where tiflux_client_id = ${clientId}
        and deleted_at is null
      limit 1
    `) ?? [];

  const [overview] =
    (await prisma.$queryRaw`
      with params as (
        select ${clientId}::int as client_id, ${start}::date as d1, ${end}::date as d2
      ),
      appts as (
        select
          a.ticket_number,
          a.appointment_date::date as appointment_date,
          a.init_time::time as init_time,
          a.end_time::time as end_time,
          a.valorization_raw,
          case
            when a.init_time is null or a.end_time is null then 0
            when a.end_time::time >= a.init_time::time
              then extract(epoch from (a.end_time::time - a.init_time::time)) / 60
            else extract(epoch from ((a.end_time::time + interval '24 hours') - a.init_time::time)) / 60
          end as minutes
        from tiflux.ticket_appointments a, params p
        where a.client_external_id = p.client_id
          and a.appointment_date::date between p.d1 and p.d2
      ),
      tickets_created as (
        select t.ticket_number
        from tiflux.tickets t, params p
        where t.client_external_id = p.client_id
          and t.created_at_source >= p.d1::timestamptz
          and t.created_at_source < (p.d2 + 1)::timestamptz
      ),
      tickets_updated as (
        select t.ticket_number
        from tiflux.tickets t, params p
        where t.client_external_id = p.client_id
          and t.updated_at_source >= p.d1::timestamptz
          and t.updated_at_source < (p.d2 + 1)::timestamptz
      )
      select
        (select count(*) from tickets_created)::int as tickets_created,
        (select count(*) from tickets_updated)::int as tickets_updated,
        (select count(distinct ticket_number) from appts)::int as tickets_with_appointments,
        (select count(*) from appts)::int as appointments,
        (select coalesce(sum(minutes), 0)::int from appts)::int as minutes
    `) ?? [];

  const byTicket =
    (await prisma.$queryRaw`
      with appts as (
        select
          a.ticket_number,
          min(a.appointment_date::date)::text as first_appointment_date,
          max(a.appointment_date::date)::text as last_appointment_date,
          count(*)::int as appointments,
          coalesce(sum(
            case
              when a.init_time is null or a.end_time is null then 0
              when a.end_time::time >= a.init_time::time
                then extract(epoch from (a.end_time::time - a.init_time::time)) / 60
              else extract(epoch from ((a.end_time::time + interval '24 hours') - a.init_time::time)) / 60
            end
          ), 0)::int as minutes
        from tiflux.ticket_appointments a
        where a.client_external_id = ${clientId}
          and a.appointment_date::date between ${start}::date and ${end}::date
        group by a.ticket_number
      )
      select
        a.ticket_number,
        t.title,
        t.created_at_source::text as created_at_source,
        t.updated_at_source::text as updated_at_source,
        t.desk_name,
        a.first_appointment_date,
        a.last_appointment_date,
        a.appointments,
        a.minutes
      from appts a
      left join tiflux.tickets t on t.ticket_number = a.ticket_number
      order by a.minutes desc, a.ticket_number asc
      limit 20
    `) ?? [];

  const byAssistance =
    (await prisma.$queryRaw`
      select
        case
          when lower(coalesce(a.valorization_raw::text, '') || ' ' || coalesce(a.description, '')) like '%externo%'
            or lower(coalesce(a.valorization_raw::text, '') || ' ' || coalesce(a.description, '')) like '%presencial%'
            or lower(coalesce(a.valorization_raw::text, '') || ' ' || coalesce(a.description, '')) like '%in-person%'
            then 'externo'
          when lower(coalesce(a.valorization_raw::text, '') || ' ' || coalesce(a.description, '')) like '%remoto%'
            or lower(coalesce(a.valorization_raw::text, '') || ' ' || coalesce(a.description, '')) like '%remote%'
            then 'remoto'
          when lower(coalesce(a.valorization_raw::text, '') || ' ' || coalesce(a.description, '')) like '%interno%'
            then 'interno'
          else 'sem'
        end as bucket,
        count(*)::int as appointments,
        coalesce(sum(
          case
            when a.init_time is null or a.end_time is null then 0
            when a.end_time::time >= a.init_time::time
              then extract(epoch from (a.end_time::time - a.init_time::time)) / 60
            else extract(epoch from ((a.end_time::time + interval '24 hours') - a.init_time::time)) / 60
          end
        ), 0)::int as minutes
      from tiflux.ticket_appointments a
      where a.client_external_id = ${clientId}
        and a.appointment_date::date between ${start}::date and ${end}::date
      group by bucket
      order by bucket
    `) ?? [];

  const [cacheRange] =
    (await prisma.$queryRaw`
      select
        min(a.appointment_date)::text as min_date,
        max(a.appointment_date)::text as max_date,
        count(*)::int as appointments,
        count(distinct a.ticket_number)::int as tickets
      from tiflux.ticket_appointments a
      where a.client_external_id = ${clientId}
    `) ?? [];

  const daily =
    (await prisma.$queryRaw`
      select
        a.appointment_date::text as day,
        count(*)::int as appointments,
        count(distinct a.ticket_number)::int as tickets
      from tiflux.ticket_appointments a
      where a.client_external_id = ${clientId}
        and a.appointment_date::date between ${start}::date and ${end}::date
      group by a.appointment_date
      order by a.appointment_date
    `) ?? [];

  console.log(
    JSON.stringify(
      {
        input: { clientId, start, end },
        company,
        overview: {
          ...overview,
          hhmm: hhmm(overview?.minutes),
        },
        cacheRange,
        daily,
        byAssistance: byAssistance.map((r) => ({
          ...r,
          hhmm: hhmm(r.minutes),
        })),
        topTicketsByMinutes: byTicket.map((r) => ({
          ...r,
          hhmm: hhmm(r.minutes),
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
