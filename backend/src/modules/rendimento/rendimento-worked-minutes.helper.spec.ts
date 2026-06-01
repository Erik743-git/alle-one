import {
  appointmentToInterval,
  computeUnionWorkedMinutes,
  mergeIntervals,
} from './rendimento-worked-minutes.helper';

describe('rendimento-worked-minutes', () => {
  it('mescla intervalos sobrepostos no mesmo dia (10-12 e 10-11 = 2h)', () => {
    const total = computeUnionWorkedMinutes([
      {
        appointment_date: '2026-05-10',
        init_time: '10:00',
        end_time: '12:00',
        minutes: 120,
      },
      {
        appointment_date: '2026-05-10',
        init_time: '10:00',
        end_time: '11:00',
        minutes: 60,
      },
    ]);
    expect(total).toBe(120);
  });

  it('soma intervalos adjacentes sem sobreposição', () => {
    const total = computeUnionWorkedMinutes([
      {
        appointment_date: '2026-05-10',
        init_time: '08:00',
        end_time: '10:00',
        minutes: 120,
      },
      {
        appointment_date: '2026-05-10',
        init_time: '10:00',
        end_time: '12:00',
        minutes: 120,
      },
    ]);
    expect(total).toBe(240);
  });

  it('filtra hora extra e plantão separadamente', () => {
    const rows = [
      {
        appointment_date: '2026-05-10',
        init_time: '18:00',
        end_time: '20:00',
        minutes: 120,
        valorization_raw: { name: 'HORA EXTRA' },
      },
      {
        appointment_date: '2026-05-11',
        init_time: '08:00',
        end_time: '12:00',
        minutes: 240,
        valorization_raw: { name: 'Plantão' },
      },
    ];
    expect(computeUnionWorkedMinutes(rows, 'EXTRA')).toBe(120);
    expect(computeUnionWorkedMinutes(rows, 'PLANTAO')).toBe(240);
    expect(computeUnionWorkedMinutes(rows, 'ALL')).toBe(360);
  });

  it('mergeIntervals une blocos sobrepostos', () => {
    expect(
      mergeIntervals([
        { start: 600, end: 720 },
        { start: 600, end: 660 },
      ]),
    ).toEqual([{ start: 600, end: 720 }]);
  });

  it('appointmentToInterval usa minutes quando end_time ausente', () => {
    expect(appointmentToInterval('10:00', null, 90)).toEqual({
      start: 600,
      end: 690,
    });
  });
});
