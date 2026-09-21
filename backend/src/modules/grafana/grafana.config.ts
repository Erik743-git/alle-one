/**
 * Integração com o Grafana.
 *
 * O portal não guarda cópia de dashboard: usa o token da empresa para
 * perguntar ao Grafana o que ela tem publicado e mostra cada um num quadro.
 */

/** Endereço que o NAVEGADOR usa para abrir os quadros. */
export function grafanaPublicUrl(): string {
  return (process.env.GRAFANA_PUBLIC_URL ?? '').trim().replace(/\/+$/, '');
}

/**
 * Endereço que o SERVIDOR usa para falar com a API do Grafana.
 * Pode ser interno; quando não informado, usa o mesmo do navegador.
 */
export function grafanaApiUrl(): string {
  const interno = (process.env.GRAFANA_API_URL ?? '').trim().replace(/\/+$/, '');
  return interno || grafanaPublicUrl();
}

/** Token da organização de demonstração, para empresa sem token próprio. */
export function grafanaDemoToken(): string {
  return (process.env.GRAFANA_DEMO_TOKEN ?? '').trim();
}

export function isGrafanaConfigured(): boolean {
  return Boolean(grafanaPublicUrl());
}

/** A listagem muda pouco; evita bater na API do Grafana a cada abertura. */
export function grafanaCacheMs(): number {
  const raw = Number(process.env.GRAFANA_CACHE_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 5 * 60 * 1000;
}

export function grafanaTimeoutMs(): number {
  const raw = Number(process.env.GRAFANA_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 15_000;
}
