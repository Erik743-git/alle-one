export type ReportFormatOption = "CSV" | "XLSX";

/** Valor enviado ao backend para relatório de apontamentos de todas as empresas. */
export const ALL_COMPANIES_REPORT_VALUE = "__all__";

export const REPORT_TYPES = [
  {
    value: "1",
    label: "Apontamentos",
    formats: ["CSV", "XLSX"] as const,
  },
  {
    value: "4",
    label: "Estatística Geral",
    formats: ["CSV", "XLSX"] as const,
  },
  {
    value: "5",
    label: "Inventário",
    formats: ["CSV", "XLSX"] as const,
  },
  {
    value: "6",
    label: "Fechamento / cobrança",
    formats: ["CSV", "XLSX"] as const,
  },
] as const;

export type ReportTypeValue = (typeof REPORT_TYPES)[number]["value"];

const LABEL_BY_VALUE = Object.fromEntries(
  REPORT_TYPES.map((item) => [item.value, item.label]),
) as Record<string, string>;

export function getReportTypeLabel(type: string | number): string {
  const key = String(type);
  return LABEL_BY_VALUE[key] ?? `Tipo ${key}`;
}

export function getFormatsForReportType(
  type: string,
): readonly ReportFormatOption[] {
  const found = REPORT_TYPES.find((item) => item.value === type);
  return found?.formats ?? ["XLSX"];
}

export function isAllowedReportType(type: string): boolean {
  return REPORT_TYPES.some((item) => item.value === type);
}

export function reportTypeRequiresPeriod(type: string): boolean {
  return type !== "5";
}

export function reportTypeSupportsCollaborator(type: string): boolean {
  return type === "1";
}

export function reportTypeSupportsMultiCompany(type: string): boolean {
  return type === "5";
}
