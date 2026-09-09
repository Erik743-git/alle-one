import { toExcelDuration, formatGeneratedAtBR } from './reports.service';

/**
 * Duração e carimbo de geração no XLSX.
 *
 * Antes a duração ia como texto ("01:30") e o Excel não somava nem ao
 * selecionar as células; e o "Gerado em" usava toISOString, gravando UTC —
 * saía 3h à frente para quem gerou o relatório no Brasil.
 */
describe('XLSX de rendimento — duração e carimbo', () => {
  describe('toExcelDuration', () => {
    it('converte minutos para fração de dia, que é como o Excel soma', () => {
      expect(toExcelDuration(1440)).toBe(1);
      expect(toExcelDuration(720)).toBe(0.5);
      expect(toExcelDuration(90)).toBeCloseTo(0.0625, 10);
    });

    it('passa de 24h sem voltar a zero', () => {
      // 27:28 = 1648 min. Com [h]:mm o Excel mostra 27:28, não 03:28.
      expect(toExcelDuration(1648)).toBeCloseTo(1648 / 1440, 10);
      expect(toExcelDuration(1648)).toBeGreaterThan(1);
    });

    it('devolve null para duração ausente, para a célula ficar vazia', () => {
      // Zero entraria na contagem como se fosse um lançamento de 0 minuto.
      expect(toExcelDuration(0)).toBeNull();
      expect(toExcelDuration(null)).toBeNull();
      expect(toExcelDuration(undefined)).toBeNull();
      expect(toExcelDuration(Number.NaN)).toBeNull();
      expect(toExcelDuration(-30)).toBeNull();
    });

    it('somar as frações reproduz o total em minutos', () => {
      const partes = [15, 180, 60, 1648];
      const soma = partes
        .map((m) => toExcelDuration(m) ?? 0)
        .reduce((a, b) => a + b, 0);
      expect(Math.round(soma * 1440)).toBe(1903);
    });
  });

  describe('formatGeneratedAtBR', () => {
    it('usa o fuso de São Paulo, não o UTC do servidor', () => {
      // 2026-09-09T13:41:40Z é 10:41:40 em São Paulo (UTC-3).
      const utc = new Date('2026-09-09T13:41:40.000Z');
      expect(formatGeneratedAtBR(utc)).toBe('09/09/2026 10:41:40');
    });

    it('vira o dia corretamente quando o UTC já passou da meia-noite', () => {
      // 01:30Z do dia 10 ainda é 22:30 do dia 9 no Brasil.
      const utc = new Date('2026-09-10T01:30:00.000Z');
      expect(formatGeneratedAtBR(utc)).toBe('09/09/2026 22:30:00');
    });
  });
});
