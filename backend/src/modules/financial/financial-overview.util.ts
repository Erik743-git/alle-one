export function toFinancialNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof value === 'object' && value && 'toNumber' in value) {
    const fn = (value as { toNumber?: () => number }).toNumber;
    if (typeof fn === 'function') {
      const n = fn();
      return Number.isFinite(n) ? n : 0;
    }
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export type FinancialSpecialtyLine = {
  monthlyHours?: number;
  unlimited?: boolean;
  excessHourPrice?: unknown;
};

export type FinancialContractInput = {
  status: string;
  monthlyHours?: unknown;
  extraHourPrice?: unknown;
  specialties?: FinancialSpecialtyLine[];
};

export function isActiveContractStatus(status: string): boolean {
  return status === 'ACTIVE';
}

export function contractedHoursFromContract(
  contract: FinancialContractInput,
): number {
  const lines = contract.specialties ?? [];
  if (lines.length > 0) {
    return lines.reduce((sum, line) => {
      if (line.unlimited) return sum;
      return sum + toFinancialNumber(line.monthlyHours);
    }, 0);
  }
  return toFinancialNumber(contract.monthlyHours);
}

/** Preço único da hora excedente; null se não houver taxa única. */
export function extraHourPriceFromContract(
  contract: FinancialContractInput,
): number | null {
  const billed = (contract.specialties ?? []).filter((line) => !line.unlimited);
  if (billed.length > 0) {
    const prices = billed.map((line) =>
      toFinancialNumber(line.excessHourPrice),
    );
    const first = prices[0];
    return prices.every((price) => price === first) ? first : null;
  }
  if (contract.specialties && contract.specialties.length > 0) {
    return null;
  }
  return toFinancialNumber(contract.extraHourPrice);
}

export function uniqueActiveExtraHourPrice(
  contracts: FinancialContractInput[],
): number | null {
  const active = contracts.filter((c) => isActiveContractStatus(c.status));
  if (active.length === 0) return null;
  const rates = active.map((c) => extraHourPriceFromContract(c));
  if (rates.some((rate) => rate == null)) return null;
  const first = rates[0] as number;
  return rates.every((rate) => rate === first) ? first : null;
}

export function computeFinancialOverviewTotals(input: {
  contracts: FinancialContractInput[];
  usedHours: number;
}): {
  contractedHours: number;
  usedHours: number;
  extraHours: number;
  extraHourPrice: number | null;
  extraAmount: number;
} {
  const contractedHours = input.contracts
    .filter((c) => isActiveContractStatus(c.status))
    .reduce((sum, c) => sum + contractedHoursFromContract(c), 0);
  const usedHours = toFinancialNumber(input.usedHours);
  const extraHours = Math.max(0, usedHours - contractedHours);
  const extraHourPrice = uniqueActiveExtraHourPrice(input.contracts);
  const extraAmount = extraHourPrice == null ? 0 : extraHours * extraHourPrice;
  return {
    contractedHours,
    usedHours,
    extraHours,
    extraHourPrice,
    extraAmount,
  };
}
