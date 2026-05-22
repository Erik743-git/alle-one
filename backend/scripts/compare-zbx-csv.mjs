import fs from 'fs';

const path = process.argv[2] || 'c:/Users/erik.manarin/Downloads/zbx_problems_export (1).csv';
const text = fs.readFileSync(path, 'utf8');
const lines = text.split(/\r?\n/).filter((l) => l.trim());

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (c === ',' && !inQ) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

const header = parseCsvLine(lines[0]);
const sevIdx = header.indexOf('Severity');
const timeIdx = header.indexOf('Time');
const statusIdx = header.indexOf('Status');

const counts = { High: 0, Disaster: 0, other: {} };
const byMonth = new Map();
let minT = null;
let maxT = null;

for (let i = 1; i < lines.length; i++) {
  const cols = parseCsvLine(lines[i]);
  const sev = cols[sevIdx] || '';
  const time = cols[timeIdx] || '';
  const status = cols[statusIdx] || '';
  const d = new Date(time.replace(' ', 'T'));
  if (!Number.isNaN(d.getTime())) {
    if (!minT || d < minT) minT = d;
    if (!maxT || d > maxT) maxT = d;
  }
  const mk = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  if (!byMonth.has(mk)) byMonth.set(mk, { High: 0, Disaster: 0, rows: 0 });
  const m = byMonth.get(mk);
  m.rows += 1;
  if (sev === 'High') {
    counts.High += 1;
    m.High += 1;
  } else if (sev === 'Disaster') {
    counts.Disaster += 1;
    m.Disaster += 1;
  } else {
    counts.other[sev] = (counts.other[sev] || 0) + 1;
  }
}

console.log('Arquivo:', path);
console.log('Linhas de dados:', lines.length - 1);
console.log('Período Time (min/max):', minT?.toISOString(), maxT?.toISOString());
console.log('Totais CSV (todas as linhas):', counts);
console.log('Por mês (UTC month key):');
for (const [k, v] of [...byMonth.entries()].sort()) {
  console.log(`  ${k}: High=${v.High} Disaster=${v.Disaster} total=${v.rows}`);
}

// Abril 2026 local BR (UTC-3): 2026-04-01 03:00 UTC .. 2026-05-01 02:59 UTC
const startBr = new Date('2026-04-01T00:00:00-03:00');
const endBr = new Date('2026-04-30T23:59:59-03:00');
let highBr = 0;
let disasterBr = 0;
for (let i = 1; i < lines.length; i++) {
  const cols = parseCsvLine(lines[i]);
  const sev = cols[sevIdx] || '';
  const time = cols[timeIdx] || '';
  const d = new Date(time.replace(' ', 'T'));
  if (d < startBr || d > endBr) continue;
  if (sev === 'High') highBr += 1;
  if (sev === 'Disaster') disasterBr += 1;
}
console.log('Filtro 01/04–30/04/2026 America/Sao_Paulo:', {
  High: highBr,
  Disaster: disasterBr,
  sum: highBr + disasterBr,
});

// Eventos no CSV após o último timestamp (possível lacuna do export)
const lastCsv = maxT;
let afterLast = { High: 0, Disaster: 0 };
for (let i = 1; i < lines.length; i++) {
  const cols = parseCsvLine(lines[i]);
  const sev = cols[sevIdx] || '';
  const d = new Date((cols[timeIdx] || '').replace(' ', 'T'));
  if (d <= lastCsv) continue;
  if (sev === 'High') afterLast.High += 1;
  if (sev === 'Disaster') afterLast.Disaster += 1;
}

const endAprUtc = new Date('2026-04-30T23:59:59Z');
let missingTail = { High: 0, Disaster: 0 };
for (let i = 1; i < lines.length; i++) {
  const cols = parseCsvLine(lines[i]);
  const sev = cols[sevIdx] || '';
  const d = new Date((cols[timeIdx] || '').replace(' ', 'T'));
  if (d <= lastCsv || d > endAprUtc) continue;
  if (sev === 'High') missingTail.High += 1;
  if (sev === 'Disaster') missingTail.Disaster += 1;
}
console.log('Após último registro do CSV até 30/04 UTC:', missingTail);
console.log('\nRelatório Alle (captura): High=753 Disaster=81');
console.log('Diferença vs CSV:', {
  High: 753 - counts.High,
  Disaster: 81 - counts.Disaster,
});
