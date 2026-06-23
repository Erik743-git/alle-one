import 'dotenv/config';

const base = process.env.TIFLUX_API_URL?.replace(/\/$/, '');
const token = process.env.TIFLUX_TOKEN;
const ticketNumber = 72713;

// Teste não destrutivo: PUT com o mesmo stage_id atual (Em Andamento).
const body = { stage_id: 357047 };

const res = await fetch(`${base}/tickets/${ticketNumber}`, {
  method: 'PUT',
  headers: {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

const text = await res.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  data = text;
}

console.log('PUT status:', res.status);
console.log('response stage:', data?.ticket?.stage ?? data?.stage ?? data);
