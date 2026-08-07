const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PLACEHOLDER_VALUES = new Set(['', '__all__', 'all', 'undefined', 'null']);

/** Query string opcional: ignora vazio, placeholders e UUID inválido. */
export function optionalUuidQuery(value: unknown): string | undefined {
  if (value == null) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed || PLACEHOLDER_VALUES.has(trimmed.toLowerCase())) {
    return undefined;
  }
  if (!UUID_REGEX.test(trimmed)) return undefined;
  return trimmed;
}
