import 'dotenv/config';

const base = process.env.TIFLUX_API_URL?.replace(/\/$/, '');
const token = process.env.TIFLUX_TOKEN;
const ticketNumber = 72713;
const deskId = 59316;

async function api(path, method = 'GET', body) {
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
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, ok: res.ok, data };
}

try {
  const ticket = await api(`/tickets/${ticketNumber}`);
  console.log('GET ticket status:', ticket.status);
  const t = ticket.data?.ticket ?? ticket.data;
  console.log('current stage:', t?.stage?.name, 'id:', t?.stage?.id);
  console.log('desk:', t?.desk?.name, 'id:', t?.desk?.id);

  const stages = await api(`/desks/${deskId}/stages`);
  console.log('\nDesk stages status:', stages.status);
  const list = Array.isArray(stages.data) ? stages.data : stages.data?.stages ?? [];
  for (const s of list) {
    console.log(`- id=${s.id} name=${s.name} first_stage=${s.first_stage}`);
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
