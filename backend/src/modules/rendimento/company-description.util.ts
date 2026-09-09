import { appointmentDescriptionToPlainText } from '../tickets/appointment-doc.util';

/** Descrição vinda de e-mail chega como HTML; aqui vira texto legível. */
function stripHtml(value: string): string {
  return value
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"');
}

function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

/**
 * Prepara a descrição para leitura na agenda da empresa.
 *
 * Sem isto o cliente via o formato interno cru na tela — literalmente
 * `__ALLEONE_DOC_V1__:{"version":1,"blocks":[...]}` em vez do texto — e, no
 * caso de apontamento nascido de e-mail, as tags HTML soltas.
 */
export function summarizeCompanyAppointmentDescription(
  raw: string | null | undefined,
): {
  summary: string | null;
  full: string | null;
  truncated: boolean;
} {
  if (!raw?.trim()) {
    return { summary: null, full: null, truncated: false };
  }

  let texto = appointmentDescriptionToPlainText(raw.trim());
  if (looksLikeHtml(texto)) {
    texto = stripHtml(texto);
  }
  if (!texto.trim()) {
    return { summary: null, full: null, truncated: false };
  }

  const full = texto.trim().replace(/\s+/g, ' ');

  const listingMatch = full.match(
    /\s(?=\d{2}-\S+\s+(?:\S+\s+){0,6}CTE\s+\d+)/i,
  );
  if (listingMatch?.index != null && listingMatch.index > 15) {
    return {
      summary: full.slice(0, listingMatch.index).trim(),
      full,
      truncated: true,
    };
  }

  const dateCount = (full.match(/\b\d{2}\/\d{2}\/\d{4}\b/g) ?? []).length;
  if (dateCount >= 4 && full.length > 200) {
    const firstDate = full.search(/\b\d{2}\/\d{2}\/\d{4}\b/);
    if (firstDate > 30) {
      return {
        summary: full.slice(0, firstDate).trim(),
        full,
        truncated: true,
      };
    }
  }

  // `texto`, não `raw`: usar o original aqui traria de volta o prefixo do
  // formato interno na primeira linha.
  const newline = texto
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (newline && newline.length < full.length * 0.6 && newline.length <= 240) {
    return { summary: newline, full, truncated: full.length > newline.length };
  }

  if (full.length > 240) {
    return { summary: `${full.slice(0, 237)}…`, full, truncated: true };
  }

  return { summary: full, full, truncated: false };
}
