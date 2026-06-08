/** Opções provisórias de justificativa (admin) — refinaremos depois. */
export const RENDIMENTO_ADMIN_RESPONSE_OPTIONS = [
  { code: "VALID", label: "Apontamento válido" },
  { code: "CORRECTED", label: "Será corrigido no TiFlux" },
  { code: "DUPLICATE", label: "Apontamento duplicado" },
  { code: "NOT_BILLABLE", label: "Não faturável / fora do escopo" },
  { code: "OTHER", label: "Outro (com observação)" },
] as const;

export function adminResponseLabel(code: string | null | undefined) {
  if (!code) return null;
  return (
    RENDIMENTO_ADMIN_RESPONSE_OPTIONS.find((o) => o.code === code)?.label ??
    code
  );
}
