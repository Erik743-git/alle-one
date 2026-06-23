import 'dotenv/config';

const base = process.env.TIFLUX_API_URL?.replace(/\/$/, '');
const token = process.env.TIFLUX_TOKEN;
const ticketNumber = 72713;
const appointmentId = 23009564;

async function probe(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { method, path, status: res.status, body: text.slice(0, 500) };
}

const tests = [
  await probe('PUT', `/tickets/${ticketNumber}/appointments/${appointmentId}`, {
    date: '2026-06-23',
    init_time: '09:58',
    end_time: '10:00',
    description: 'teste edit',
  }),
  await probe('PATCH', `/tickets/${ticketNumber}/appointments/${appointmentId}`, {
    description: 'teste patch',
  }),
  await probe('DELETE', `/tickets/${ticketNumber}/appointments/${appointmentId}`),
  await probe('DELETE', `/appointments/${appointmentId}`),
];

for (const t of tests) {
  console.log(JSON.stringify(t, null, 2));
  console.log('---');
}
