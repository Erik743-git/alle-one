import {
  analyzeRendimentoDay,
  GAP_ALERT_MINUTES,
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
    // Dia passado: gap final após o almoço até completar 8h (14:00 + 4h30 => 18:30).
    expect(idle!.toTime).toBe('18:30');
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
    expect(
      insights.gaps.filter((g) => g.type === 'idle').length,
    ).toBeGreaterThan(0);
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
      (g) =>
        g.type === 'idle' && g.fromTime === '12:00' && g.toTime === '16:30',
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
        (g) =>
          g.type === 'idle' && g.fromTime === '05:01' && g.toTime === '09:30',
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
    // Jornada regular começa 09:30 → término de alertas às 19:00 (8h + 1h30).
    // Lacuna 18:00–19:00 tem só 60 min (não gera alerta); o longo intervalo do meio sim.
    expect(
      insights.gaps.some((g) => g.type === 'idle' && g.fromTime === '18:00'),
    ).toBe(false);
    expect(insights.hasIdleGapAlert).toBe(true);
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

  it('após dividir almoço, restante de até 60 min não vira alerta', () => {
    const { insights } = analyzeRendimentoDay([
      {
        id: 1,
        date: '2026-06-04',
        initTime: '08:00:00',
        endTime: '10:42:00',
        minutes: 162,
        hoursFormatted: '02:42',
        ticketNumber: 1,
        clientName: null,
        description: null,
      },
      {
        id: 2,
        date: '2026-06-04',
        initTime: '12:34:00',
        endTime: '17:00:00',
        minutes: 266,
        hoursFormatted: '04:26',
        ticketNumber: 2,
        clientName: null,
        description: null,
      },
    ]);

    const lunch = insights.gaps.find((g) => g.type === 'lunch');
    expect(lunch).toBeTruthy();
    expect(lunch!.fromTime).toBe('10:42');
    expect(lunch!.toTime).toBe('12:12');

    const shortIdle = insights.gaps.find(
      (g) =>
        g.type === 'idle' && g.fromTime === '12:12' && g.toTime === '12:34',
    );
    expect(shortIdle).toBeUndefined();
    expect(
      insights.gaps.filter(
        (g) => g.type === 'idle' && g.gapMinutes <= GAP_ALERT_MINUTES,
      ),
    ).toHaveLength(0);
  });

  it('não alerta ociosidade quando apontamento menor está dentro de um maior (sobreposição)', () => {
    const { insights } = analyzeRendimentoDay([
      {
        id: 1,
        date: '2026-06-09',
        initTime: '08:30:00',
        endTime: '12:00:00',
        minutes: 210,
        hoursFormatted: '03:30',
        ticketNumber: 70714,
        clientName: 'Apodi',
        description: 'Reunião diária',
      },
      {
        id: 2,
        date: '2026-06-09',
        initTime: '09:05:00',
        endTime: '09:15:00',
        minutes: 10,
        hoursFormatted: '00:10',
        ticketNumber: 69866,
        clientName: 'I7',
        description: 'Serviço no ar',
      },
      {
        id: 3,
        date: '2026-06-09',
        initTime: '13:35:00',
        endTime: '14:40:00',
        minutes: 65,
        hoursFormatted: '01:05',
        ticketNumber: 70730,
        clientName: 'Nasser',
        description: null,
      },
      {
        id: 4,
        date: '2026-06-09',
        initTime: '16:00:00',
        endTime: '18:00:00',
        minutes: 120,
        hoursFormatted: '02:00',
        ticketNumber: 70714,
        clientName: 'Apodi',
        description: null,
      },
    ]);

    expect(insights.regularMinutes).toBe(210 + 65 + 120);
    expect(
      insights.gaps.some((g) => g.type === 'idle' && g.fromTime === '09:15'),
    ).toBe(false);
    expect(
      insights.gaps.some(
        (g) =>
          (g.type === 'lunch' && g.fromTime === '12:00') ||
          (g.type === 'idle' && g.fromTime === '12:00'),
      ),
    ).toBe(true);
  });

  it('no dia atual, não gera alertas de lacuna nem almoço (expediente em andamento)', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 3, 20, 36, 0));

    const { insights } = analyzeRendimentoDay([
      {
        id: 1,
        date: '2026-06-03',
        initTime: '09:00:00',
        endTime: '11:40:00',
        minutes: 160,
        hoursFormatted: '02:40',
        ticketNumber: 1,
        clientName: null,
        description: null,
      },
      {
        id: 2,
        date: '2026-06-03',
        initTime: '13:10:00',
        endTime: '18:00:00',
        minutes: 290,
        hoursFormatted: '04:50',
        ticketNumber: 2,
        clientName: null,
        description: null,
      },
    ]);

    expect(insights.regularMinutes).toBe(450);
    expect(insights.gaps).toHaveLength(0);
    expect(insights.hasIdleGapAlert).toBe(false);
    expect(insights.hasExpectedLunch).toBe(false);

    jest.useRealTimers();
  });

  it('interrompe alertas após primeiro apontamento + jornada + almoço', () => {
    const entries = [
      {
        id: 1,
        date: '2026-06-10',
        initTime: '08:00:00',
        endTime: '10:00:00',
        minutes: 120,
        hoursFormatted: '02:00',
        ticketNumber: 1,
        clientName: null,
        description: null,
      },
      {
        id: 2,
        date: '2026-06-10',
        initTime: '12:00:00',
        endTime: '14:00:00',
        minutes: 120,
        hoursFormatted: '02:00',
        ticketNumber: 2,
        clientName: null,
        description: null,
      },
      {
        id: 3,
        date: '2026-06-10',
        initTime: '18:00:00',
        endTime: '19:00:00',
        minutes: 60,
        hoursFormatted: '01:00',
        ticketNumber: 3,
        clientName: null,
        description: null,
      },
    ];

    const { insights } = analyzeRendimentoDay(entries, undefined, {
      dailyWorkMinutes: 8 * 60,
      lunchMinutes: 90,
    });

    const idles = insights.gaps.filter((g) => g.type === 'idle');
    expect(insights.gaps.some((g) => g.type === 'lunch')).toBe(true);
    expect(
      idles.some((g) => g.fromTime === '14:00' && g.toTime === '17:30'),
    ).toBe(true);
    expect(idles.filter((g) => g.fromTime >= '17:30')).toHaveLength(0);
  });
});
