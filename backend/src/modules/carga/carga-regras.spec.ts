import { estaParado, minutosTrabalhados, semanaAtual } from './carga-regras';

describe('carga-regras', () => {
  it('semana de segunda a domingo em Brasília', () => {
    // quinta 24/09/2026 10:00 local
    expect(semanaAtual(new Date('2026-09-24T13:00:00Z'))).toEqual({
      inicio: '2026-09-21',
      fim: '2026-09-27',
      diasUteisAteHoje: 4,
    });
    // domingo: a semana útil já acabou (5 dias)
    expect(semanaAtual(new Date('2026-09-27T13:00:00Z')).diasUteisAteHoje).toBe(
      5,
    );
    // segunda 00:30 local ainda é domingo em UTC-3? não: 03:30Z já é segunda local
    expect(semanaAtual(new Date('2026-09-28T03:30:00Z')).inicio).toBe(
      '2026-09-28',
    );
    expect(semanaAtual(new Date('2026-09-28T02:30:00Z')).inicio).toBe(
      '2026-09-21',
    );
  });

  it('minutos sem sobreposição e sem comunicação', () => {
    expect(
      minutosTrabalhados([
        { data: '2026-09-21', inicio: '09:00', fim: '11:00' },
        { data: '2026-09-21', inicio: '10:00', fim: '12:00' },
        { data: '2026-09-21', inicio: '14:00', fim: '14:00' },
        { data: '2026-09-22', inicio: '09:00', fim: '09:30' },
      ]),
    ).toBe(210);
  });

  it('parado depois de 48 h', () => {
    const agora = new Date('2026-09-24T12:00:00Z');
    expect(estaParado(null, agora)).toBe(false);
    expect(estaParado(new Date('2026-09-22T13:00:00Z'), agora)).toBe(false);
    expect(estaParado(new Date('2026-09-22T11:00:00Z'), agora)).toBe(true);
  });
});
