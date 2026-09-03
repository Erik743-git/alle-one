import {
  appointmentDurationMinutes,
  appointmentToInterval,
  computeCategorizedMinutes,
  computeRawAppointmentMinutes,
  computeUnionWorkedMinutes,
  mergeIntervals,
  parseClockToMinutes,
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

  it('computeRawAppointmentMinutes soma todos os tickets sem deduplicar', () => {
    const rows = [
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
    ];
    expect(computeUnionWorkedMinutes(rows)).toBe(120);
    expect(computeRawAppointmentMinutes(rows)).toBe(180);
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

  describe('cálculo canônico de minutos (contrato §4)', () => {
    it('ignora segundos', () => {
      expect(appointmentDurationMinutes('08:00:45', '09:00:59')).toBe(60);
      expect(parseClockToMinutes('08:30:59')).toBe(510);
    });

    it('registro quebrado (hora fora de 00:00-23:59) vira 0', () => {
      expect(parseClockToMinutes('24:00')).toBeNull();
      expect(parseClockToMinutes('25:30')).toBeNull();
      expect(appointmentDurationMinutes('24:00', '02:00')).toBe(0);
      expect(appointmentDurationMinutes('08:00', '99:00')).toBe(0);
    });

    it('cruza a meia-noite', () => {
      expect(appointmentDurationMinutes('23:00', '01:00')).toBe(120);
    });

    it('fim igual ao início conta 0', () => {
      expect(appointmentDurationMinutes('10:00', '10:00')).toBe(0);
    });

    it('duração vem dos horários, não do campo minutes quando os horários são válidos', () => {
      // minutes mentiroso (999) é ignorado: 10:00-11:00 = 60
      expect(
        computeRawAppointmentMinutes([
          {
            appointment_date: '2026-05-10',
            init_time: '10:00',
            end_time: '11:00',
            minutes: 999,
          },
        ]),
      ).toBe(60);
    });

    it('apontamento de duração 0 (21:26-21:26) não vira 1 min no total bruto', () => {
      expect(
        computeRawAppointmentMinutes([
          {
            appointment_date: '2026-05-10',
            init_time: '21:26',
            end_time: '21:26',
            minutes: 0,
          },
        ]),
      ).toBe(0);
    });
  });

  describe('computeCategorizedMinutes — prioridade PLANTAO > EXTRA > NORMAL', () => {
    const row = (
      init: string,
      end: string,
      name?: string,
      date = '2026-05-10',
    ) => ({
      appointment_date: date,
      init_time: init,
      end_time: end,
      minutes: 0,
      valorization_raw: name ? { name } : null,
    });

    it('sem sobreposição: cada categoria com o seu', () => {
      const r = computeCategorizedMinutes([
        row('08:00', '12:00'),
        row('18:00', '20:00', 'HORA EXTRA'),
        row('22:00', '23:00', 'Plantão'),
      ]);
      expect(r).toEqual({
        normal: 240,
        extra: 120,
        plantao: 60,
        total: 420,
        bruto: 420,
      });
    });

    it('EXTRA em cima de NORMAL: o trecho cruzado é EXTRA, normal encolhe', () => {
      // 08:00-09:00 normal + 08:30-09:30 extra -> normal 30, extra 60, total 90
      const r = computeCategorizedMinutes([
        row('08:00', '09:00'),
        row('08:30', '09:30', 'HORA EXTRA'),
      ]);
      expect(r.normal).toBe(30);
      expect(r.extra).toBe(60);
      expect(r.plantao).toBe(0);
      expect(r.total).toBe(90);
      expect(r.bruto).toBe(120);
    });

    it('PLANTAO ganha de EXTRA no trecho cruzado', () => {
      // 20:00-22:00 extra + 21:00-23:00 plantão -> extra 60, plantão 120
      const r = computeCategorizedMinutes([
        row('20:00', '22:00', 'HORA EXTRA'),
        row('21:00', '23:00', 'Plantão'),
      ]);
      expect(r.plantao).toBe(120);
      expect(r.extra).toBe(60);
      expect(r.total).toBe(180);
    });

    it('total é sempre igual à união de tudo (computeUnionWorkedMinutes ALL)', () => {
      const rows = [
        row('08:00', '12:00'),
        row('11:00', '13:00'),
        row('11:30', '19:30', 'HORA EXTRA'),
        row('12:00', '23:59', 'Plantão'),
      ];
      expect(computeCategorizedMinutes(rows).total).toBe(
        computeUnionWorkedMinutes(rows, 'ALL'),
      );
    });

    it('plantão sobreposto no mesmo dia deduplica (não soma bruto)', () => {
      // caso Marcos: 00:30-08:30 + 00:30-06:30 + 05:00-06:00 plantão = 8h, não 15h
      const r = computeCategorizedMinutes([
        row('00:30', '08:30', 'Plantão'),
        row('00:30', '06:30', 'Plantão'),
        row('05:00', '06:00', 'Plantão'),
      ]);
      expect(r.plantao).toBe(480);
      expect(r.bruto).toBe(900);
    });
  });
});
