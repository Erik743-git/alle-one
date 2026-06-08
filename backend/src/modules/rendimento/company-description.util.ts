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

  const full = raw.trim().replace(/\s+/g, ' ');

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

  const newline = raw
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
