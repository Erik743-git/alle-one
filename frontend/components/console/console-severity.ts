import type { CSSProperties } from "react";

/** Cores de severidade (base Zabbix) usadas como acento dentro da identidade do portal. */
export const ZABBIX_SEVERITY_BG: Record<number, string> = {
  0: "#97AAB3",
  1: "#7499FF",
  2: "#FFC859",
  3: "#FFA059",
  4: "#E97659",
  5: "#E45959",
};

export const ZABBIX_SEVERITY_LABEL: Record<number, string> = {
  0: "Não classificado",
  1: "Informação",
  2: "Atenção",
  3: "Média",
  4: "Alta",
  5: "Desastre",
};

export function getZabbixSeverityBg(severity: number) {
  return ZABBIX_SEVERITY_BG[severity] ?? ZABBIX_SEVERITY_BG[0];
}

export function getZabbixSeverityLabel(severity: number) {
  return ZABBIX_SEVERITY_LABEL[severity] ?? "—";
}

/** Cor sólida da severidade (acento: barra lateral, ponto, badge). */
export function getSeverityAccent(severity: number) {
  return getZabbixSeverityBg(severity);
}

/**
 * Fundo suave da severidade — usa a cor base com baixa opacidade para
 * funcionar bem tanto no tema claro quanto no escuro do portal.
 */
export function getSeveritySoftBg(severity: number) {
  return `color-mix(in srgb, ${getZabbixSeverityBg(severity)} 14%, transparent)`;
}

/** Fundo suave um pouco mais forte (linhas prioritárias / hover). */
export function getSeveritySoftBgStrong(severity: number) {
  return `color-mix(in srgb, ${getZabbixSeverityBg(severity)} 22%, transparent)`;
}

/** Estilo do badge de severidade (pílula com a cor de acento). */
export function severityBadgeStyle(severity: number): CSSProperties {
  const color = getZabbixSeverityBg(severity);
  return {
    backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)`,
    borderColor: `color-mix(in srgb, ${color} 55%, transparent)`,
    color: `color-mix(in srgb, ${color} 75%, var(--foreground))`,
  };
}
