export type ReportFormatOption = "CSV" | "XLSX";

export const REPORT_TYPES = [
  {
    value: "1",
    label: "Rendimento",
    formats: ["CSV", "XLSX"] as const,
  },
  {
    value: "4",
    label: "Estatística Geral",
    formats: ["XLSX"] as const,
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
