import {
  analyzeRendimentoDay,
  isOvertimeValorization,
} from './rendimento-day-insights';

describe('rendimento-day-insights', () => {
  it('marca hora extra apenas pelo tipo de valorization', () => {
    expect(
      isOvertimeValorization({
        loose_service: { name: 'PLANTÃO' },
      }),
    ).toBe(true);
    expect(
      isOvertimeValorization({
        loose_service: { name: 'HORA EXTRA' },
      }),
    ).toBe(true);
    expect(
      isOvertimeValorization({
        loose_service: { name: 'HORA NORMAL' },
      }),
    ).toBe(false);
    expect(
      isOvertimeValorization({
        way: { name: 'Externo' },
        loose_service: { name: 'HORA NORMAL' },
      }),
    ).toBe(false);
  });

  it('não marca HORA EXTRA só porque o dia passou de 8h', () => {
    const entries = [
      {
        id: 1,
        date: '2026-05-20',
        initTime: '08:00:00',
        endTime: '12:00:00',
        minutes: 240,
        hoursFormatted: '04:00',
        ticketNumber: 1,
        clientName: null,
        description: null,
      },
      {
        id: 2,
        date: '2026-05-20',
        initTime: '13:30:00',
        endTime: '18:10:00',
        minutes: 280,
        hoursFormatted: '04:40',
        ticketNumber: 2,
        clientName: null,
        description: null,
      },
    ];
    const valorizationById = new Map([
      [1, { loose_service: { name: 'HORA NORMAL' } }],
      [2, { loose_service: { name: 'HORA NORMAL' } }],
    ]);

    const { entries: enriched, insights } = analyzeRendimentoDay(
      entries,
      valorizationById,
    );

    expect(enriched.every((e) => !e.isOvertime)).toBe(true);
    expect(insights.hasOvertime).toBe(false);
    expect(insights.overtimeMinutes).toBe(0);
  });

  it('classifica plantão com overtimeKind e nome do serviço TiFlux', () => {
    const { entries } = analyzeRendimentoDay(
      [
        {
          id: 99,
          date: '2026-05-27',
          initTime: '00:00:00',
          endTime: '00:50:00',
          minutes: 50,
          hoursFormatted: '00:50',
          ticketNumber: 70072,
          clientName: 'TUPER',
          description: 'Reset RDP',
        },
      ],
      new Map([[99, { loose_service: { name: 'PLANTÃO' } }]]),
    );

    expect(entries[0].overtimeKind).toBe('PLANTAO');
    expect(entries[0].valorizationServiceName).toBe('PLANTÃO');
    expect(entries[0].isOvertime).toBe(true);
  });

  it('sem intervalo > 1h entre apontamentos não gera alerta entre eles, mas alerta no fim do dia', () => {
    const { insights } = analyzeRendimentoDay([
      {
        id: 1,
        date: '2026-05-11',
        initTime: '08:00:00',
        endTime: '12:00:00',
        minutes: 240,
        hoursFormatted: '04:00',
        ticketNumber: 1,
        clientName: null,
        description: null,
      },
      {
        id: 2,
        date: '2026-05-11',
        initTime: '12:45:00',
        endTime: '14:45:00',
        minutes: 120,
        hoursFormatted: '02:00',
        ticketNumber: 2,
        clientName: null,
        description: null,
      },
    ]);

    expect(insights.hasIdleGapAlert).toBe(true);
  });

  it('com um único apontamento, cria almoço 1h30 e alerta o restante do dia', () => {
    const { insights } = analyzeRendimentoDay([
      {
        id: 1,
        date: '2026-05-04',
        initTime: '09:00:00',
        endTime: '12:30:00',
        minutes: 210,
        hoursFormatted: '03:30',
        ticketNumber: 63497,
        clientName: null,
        description: null,
      },
    ]);

    const lunch = insights.gaps.find((g) => g.type === 'lunch');
    expect(lunch).toBeTruthy();
    expect(lunch!.fromTime).toBe('12:30');
    expect(lunch!.toTime).toBe('14:00');

    const idle = insights.gaps.find((g) => g.type === 'idle');
    expect(idle).toBeTruthy();
    expect(idle!.fromTime).toBe('14:00');
    // Dia passado: o gap final vai até o "virtual end" de completar 8h (faltavam 4h30 => 17:00).
    expect(idle!.toTime).toBe('17:00');
    expect(insights.hasIdleGapAlert).toBe(true);
  });

  it('perdoa 1 gap como almoço (o mais próximo de 1h30) e mantém o outro como alerta', () => {
    const { insights } = analyzeRendimentoDay([
      {
        id: 1,
        date: '2026-05-13',
        initTime: '09:00:00',
        endTime: '09:06:00',
        minutes: 6,
        hoursFormatted: '00:06',
        ticketNumber: 1,
        clientName: null,
        description: null,
      },
      {
        id: 2,
        date: '2026-05-13',
        initTime: '09:43:00',
        endTime: '09:48:00',
        minutes: 5,
        hoursFormatted: '00:05',
        ticketNumber: 2,
        clientName: null,
        description: null,
      },
      {
        id: 3,
        date: '2026-05-13',
        initTime: '09:49:00',
        endTime: '09:54:00',
        minutes: 5,
        hoursFormatted: '00:05',
        ticketNumber: 3,
        clientName: null,
        description: null,
      },
      {
        id: 4,
        date: '2026-05-13',
        initTime: '11:16:00',
        endTime: '11:35:00',
        minutes: 19,
        hoursFormatted: '00:19',
        ticketNumber: 4,
        clientName: null,
        description: null,
      },
      {
        id: 5,
        date: '2026-05-13',
        initTime: '16:25:00',
        endTime: '16:35:00',
        minutes: 10,
        hoursFormatted: '00:10',
        ticketNumber: 5,
        clientName: null,
        description: null,
      },
      {
        id: 6,
        date: '2026-05-13',
        initTime: '16:50:00',
        endTime: '17:40:00',
        minutes: 50,
        hoursFormatted: '00:50',
        ticketNumber: 6,
        clientName: null,
        description: null,
      },
    ]);

    const lunch = insights.gaps.find((g) => g.type === 'lunch');
    expect(lunch).toBeTruthy();
    expect(lunch!.fromTime).toBe('09:54');
    expect(lunch!.toTime).toBe('11:16');
    expect(insights.gaps.filter((g) => g.type === 'idle').length).toBeGreaterThan(0);
    expect(insights.hasIdleGapAlert).toBe(true);
  });

  it('gap longo escolhido como almoço vira 1h30 + alerta com o restante', () => {
    const { insights } = analyzeRendimentoDay([
      {
        id: 1,
        date: '2026-05-29',
        initTime: '10:00:00',
        endTime: '10:30:00',
        minutes: 30,
        hoursFormatted: '00:30',
        ticketNumber: 67486,
        clientName: null,
        description: null,
      },
      {
        id: 2,
        date: '2026-05-29',
        initTime: '16:30:00',
        endTime: '18:00:00',
        minutes: 90,
        hoursFormatted: '01:30',
        ticketNumber: 70351,
        clientName: null,
        description: null,
      },
    ]);

    const lunch = insights.gaps.find((g) => g.type === 'lunch');
    expect(lunch).toBeTruthy();
    expect(lunch!.fromTime).toBe('10:30');
    expect(lunch!.toTime).toBe('12:00');
    expect(lunch!.gapMinutes).toBe(90);

    const midIdle = insights.gaps.find(
      (g) => g.type === 'idle' && g.fromTime === '12:00' && g.toTime === '16:30',
    );
    expect(midIdle).toBeTruthy();
    expect(midIdle!.gapMinutes).toBe(270);
    expect(insights.hasIdleGapAlert).toBe(true);
  });

  it('não cria alerta de gap depois de completar 8h trabalhadas no dia', () => {
    const { insights } = analyzeRendimentoDay([
      {
        id: 1,
        date: '2026-05-20',
        initTime: '06:40:00',
        endTime: '10:30:00',
        minutes: 230,
        hoursFormatted: '03:50',
        ticketNumber: 1,
        clientName: null,
        description: null,
      },
      {
        id: 2,
        date: '2026-05-20',
        initTime: '10:30:00',
        endTime: '12:00:00',
        minutes: 90,
        hoursFormatted: '01:30',
        ticketNumber: 2,
        clientName: null,
        description: null,
      },
      {
        id: 3,
        date: '2026-05-20',
        initTime: '13:30:00',
        endTime: '14:20:00',
        minutes: 50,
        hoursFormatted: '00:50',
        ticketNumber: 3,
        clientName: null,
        description: null,
      },
      {
        id: 4,
        date: '2026-05-20',
        initTime: '15:00:00',
        endTime: '18:00:00',
        minutes: 180,
        hoursFormatted: '03:00',
        ticketNumber: 4,
        clientName: null,
        description: null,
      },
      {
        id: 5,
        date: '2026-05-20',
        initTime: '20:00:00',
        endTime: '22:00:00',
        minutes: 120,
        hoursFormatted: '02:00',
        ticketNumber: 5,
        clientName: null,
        description: null,
      },
    ]);

    // Gap 18:00–20:00 existe, mas o dia já completou 8h (03:50+01:30+00:50+03:00=09:10).
    // Então não deve alertar gaps depois desse ponto.
    expect(
      insights.gaps.some((g) => g.type === 'idle' && g.fromTime === '18:00'),
    ).toBe(false);
  });

  it('não cria alerta depois de uma HORA EXTRA (HE não entra na jornada regular)', () => {
    const valorizationById = new Map([
      [1, { loose_service: { name: 'HORA EXTRA' } }],
      [2, { loose_service: { name: 'HORA NORMAL' } }],
    ]);

    const { insights } = analyzeRendimentoDay(
      [
        {
          id: 1,
          date: '2026-05-21',
          initTime: '00:00:00',
          endTime: '05:01:00',
          minutes: 301,
          hoursFormatted: '05:01',
          ticketNumber: 1,
          clientName: null,
          description: null,
        },
        {
          id: 2,
          date: '2026-05-21',
          initTime: '09:30:00',
          endTime: '10:00:00',
          minutes: 30,
          hoursFormatted: '00:30',
          ticketNumber: 2,
          clientName: null,
          description: null,
        },
      ],
      valorizationById,
    );

    // Gap 05:01–09:30 existe, mas vem *depois* de HE; não deve gerar alerta.
    expect(
      insights.gaps.some(
        (g) => g.type === 'idle' && g.fromTime === '05:01' && g.toTime === '09:30',
      ),
    ).toBe(false);
  });

  it('com HE no dia, regularMinutes soma só HORA NORMAL e o gap final considera apenas jornada regular', () => {
    const valorizationById = new Map([
      [1, { loose_service: { name: 'HORA EXTRA' } }],
      [2, { loose_service: { name: 'HORA NORMAL' } }],
      [3, { loose_service: { name: 'HORA NORMAL' } }],
    ]);

    const { insights } = analyzeRendimentoDay(
      [
        {
          id: 1,
          date: '2026-05-04',
          initTime: '00:00:00',
          endTime: '05:01:00',
          minutes: 301,
          hoursFormatted: '05:01',
          ticketNumber: 1,
          clientName: null,
          description: null,
        },
        {
          id: 2,
          date: '2026-05-04',
          initTime: '09:30:00',
          endTime: '10:20:00',
          minutes: 50,
          hoursFormatted: '00:50',
          ticketNumber: 2,
          clientName: null,
          description: null,
        },
        {
          id: 3,
          date: '2026-05-04',
          initTime: '17:30:00',
          endTime: '18:00:00',
          minutes: 30,
          hoursFormatted: '00:30',
          ticketNumber: 3,
          clientName: null,
          description: null,
        },
      ],
      valorizationById,
    );

    expect(insights.overtimeMinutes).toBe(301);
    expect(insights.regularMinutes).toBe(80);
    // Dia passado com 1h20 de jornada regular: existe gap final "virtual" até completar 8h.
    expect(
      insights.gaps.some((g) => g.type === 'idle' && g.fromTime === '18:00'),
    ).toBe(true);
  });

  it('remove alerta de gap quando novo apontamento preenche o intervalo', () => {
    const entries = [
      {
        id: 1,
        date: '2026-05-20',
        initTime: '08:00:00',
        endTime: '12:00:00',
        minutes: 240,
        hoursFormatted: '04:00',
        ticketNumber: 1,
        clientName: null,
        description: null,
      },
      {
        id: 2,
        date: '2026-05-20',
        initTime: '13:30:00',
        endTime: '14:00:00',
        minutes: 30,
        hoursFormatted: '00:30',
        ticketNumber: 2,
        clientName: null,
        description: null,
      },
      {
        id: 3,
        date: '2026-05-20',
        initTime: '14:00:00',
        endTime: '19:10:00',
        minutes: 310,
        hoursFormatted: '05:10',
        ticketNumber: 3,
        clientName: null,
        description: null,
      },
    ];

    const { insights } = analyzeRendimentoDay(entries);
    expect(insights.hasIdleGapAlert).toBe(false);
    expect(insights.hasExpectedLunch).toBe(true);
  });

  it('não alerta gap de exatamente 60 minutos', () => {
    const { insights } = analyzeRendimentoDay([
      {
        id: 1,
        date: '2026-05-20',
        initTime: '08:00:00',
        endTime: '12:00:00',
        minutes: 240,
        hoursFormatted: '04:00',
        ticketNumber: 1,
        clientName: null,
        description: null,
      },
      {
        id: 2,
        date: '2026-05-20',
        initTime: '13:00:00',
        endTime: '17:00:00',
        minutes: 240,
        hoursFormatted: '04:00',
        ticketNumber: 2,
        clientName: null,
        description: null,
      },
    ]);

    expect(insights.gaps).toHaveLength(0);
    expect(insights.hasIdleGapAlert).toBe(false);
  });
});
