import {
  computeFinancialOverviewTotals,
  contractedHoursFromContract,
  extraHourPriceFromContract,
  uniqueActiveExtraHourPrice,
} from './financial-overview.util';

describe('financial-overview.util', () => {
  it('usa especialidade quando o header legado está zerado', () => {
    const contract = {
      status: 'ACTIVE',
      monthlyHours: 0,
      extraHourPrice: 0,
      specialties: [{ monthlyHours: 10, excessHourPrice: 150 }],
    };
    expect(contractedHoursFromContract(contract)).toBe(10);
    expect(extraHourPriceFromContract(contract)).toBe(150);
  });

  it('calcula extra 2h × R$ 150 = R$ 300', () => {
    const totals = computeFinancialOverviewTotals({
      usedHours: 12,
      contracts: [
        {
          status: 'ACTIVE',
          monthlyHours: 10,
          extraHourPrice: 150,
          specialties: [{ monthlyHours: 10, excessHourPrice: 150 }],
        },
      ],
    });
    expect(totals).toEqual({
      contractedHours: 10,
      usedHours: 12,
      extraHours: 2,
      extraHourPrice: 150,
      extraAmount: 300,
    });
  });

  it('ignora contrato inativo nas horas contratadas', () => {
    const totals = computeFinancialOverviewTotals({
      usedHours: 3,
      contracts: [
        { status: 'INACTIVE', monthlyHours: 10, extraHourPrice: 150 },
        { status: 'ACTIVE', monthlyHours: 8, extraHourPrice: 100 },
      ],
    });
    expect(totals.contractedHours).toBe(8);
    expect(totals.extraHourPrice).toBe(100);
  });

  it('não define valor/hora quando há taxas diferentes', () => {
    expect(
      uniqueActiveExtraHourPrice([
        {
          status: 'ACTIVE',
          specialties: [
            { monthlyHours: 10, excessHourPrice: 150 },
            { monthlyHours: 5, excessHourPrice: 200 },
          ],
        },
      ]),
    ).toBeNull();
  });
});
