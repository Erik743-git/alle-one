/**
 * Escalas de plantão lidas do Outlook.
 *
 * Os três calendários (NOC, Tec, Infra) vivem numa caixa só — a da pessoa que
 * mantém as escalas — e estão compartilhados com a equipe. O portal lê da
 * caixa **dona**: o mesmo calendário aparece na lista de outras 23 pessoas,
 * mas com um id diferente em cada uma, e essa cópia some se a pessoa remover o
 * calendário da lista dela.
 *
 * A configuração vem do ambiente para o id não virar constante de código:
 *
 *   PLANTAO_CALENDARIOS=NOC|caixa@empresa.com|AAMk...;Tec|caixa@empresa.com|AAMk...
 *
 * Cada entrada é `rótulo|caixa|id`, separadas por `;`. Caixas diferentes por
 * entrada são aceitas — hoje são iguais, mas nada no código depende disso.
 */
export type CalendarioPlantao = {
  /** Como aparece na tela: NOC, Tec, Infra. */
  rotulo: string;
  /** Caixa dona do calendário. */
  caixa: string;
  /** Id do calendário dentro dessa caixa. */
  calendarioId: string;
};

export function calendariosDePlantao(): CalendarioPlantao[] {
  const bruto = (process.env.PLANTAO_CALENDARIOS ?? '').trim();
  if (!bruto) return [];

  return bruto
    .split(';')
    .map((entrada) => entrada.trim())
    .filter(Boolean)
    .map((entrada) => {
      const [rotulo, caixa, calendarioId] = entrada
        .split('|')
        .map((p) => p.trim());
      return { rotulo, caixa, calendarioId };
    })
    .filter(
      (c): c is CalendarioPlantao =>
        Boolean(c.rotulo) && Boolean(c.caixa) && Boolean(c.calendarioId),
    );
}

export function plantaoConfigurado(): boolean {
  return calendariosDePlantao().length > 0;
}

/**
 * Quanto tempo a listagem fica em cache.
 *
 * Curto de propósito: numa tela só de leitura o risco não é alterar algo
 * indevido, é **mostrar plantonista velho**. Quem troca a escala no Outlook e
 * vê o portal exibindo o nome antigo liga para a pessoa errada de madrugada.
 */
export function plantaoCacheMs(): number {
  const bruto = Number(process.env.PLANTAO_CACHE_MS);
  return Number.isFinite(bruto) && bruto >= 0 ? bruto : 2 * 60 * 1000;
}

export function plantaoTimeoutMs(): number {
  const bruto = Number(process.env.PLANTAO_TIMEOUT_MS);
  return Number.isFinite(bruto) && bruto > 0 ? bruto : 15_000;
}

/** Fuso em que os horários são pedidos ao Graph. */
export const PLANTAO_TIMEZONE = 'America/Sao_Paulo';
