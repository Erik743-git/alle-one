import { PlantaoService } from './plantao.service';

/**
 * As duas escalas reais têm formatos diferentes: Infra começa sexta 18:00 e
 * Sistemas cobre sábado 06:00 até domingo 22:00. Por isso "de plantão agora" tem
 * de sair da comparação com o intervalo, sem supor duração nem dia de início.
 */
describe('PlantaoService', () => {
  const envOriginal = { ...process.env };

  function build(eventosPorCaixa: Record<string, unknown>) {
    const getJson = jest.fn(async (
      caminho: string,
      _opcoes?: { headers?: Record<string, string> },
    ) => {
      const achado = Object.entries(eventosPorCaixa).find(([id]) =>
        caminho.includes(encodeURIComponent(id)),
      );
      if (!achado) throw new Error('calendário não encontrado');
      const valor = achado[1];
      if (valor instanceof Error) throw valor;
      return valor;
    });
    return {
      service: new PlantaoService({ getJson } as never),
      getJson,
    };
  }

  beforeEach(() => {
    process.env = { ...envOriginal };
    process.env.PLANTAO_CACHE_MS = '0';
    process.env.PLANTAO_CALENDARIOS = [
      'Infra|escala@alle.com|ID-INFRA',
      'Sistemas|escala@alle.com|ID-SIS',
    ].join(';');
    jest.useFakeTimers().setSystemTime(new Date('2026-09-19T20:00:00'));
  });

  afterEach(() => jest.useRealTimers());
  afterAll(() => {
    process.env = envOriginal;
  });

  it('marca como "agora" só o turno que cobre o instante atual', async () => {
    const { service } = build({
      'ID-INFRA': {
        value: [
          {
            subject: 'Plantão Jonatan',
            start: { dateTime: '2026-09-18T18:00:00.0000000' },
            end: { dateTime: '2026-09-19T18:00:00.0000000' },
          },
          {
            subject: 'Plantão Alisson',
            start: { dateTime: '2026-09-19T18:00:00.0000000' },
            end: { dateTime: '2026-09-20T18:00:00.0000000' },
          },
        ],
      },
      'ID-SIS': {
        value: [
          {
            subject: 'Plantão Rian',
            start: { dateTime: '2026-09-20T06:00:00.0000000' },
            end: { dateTime: '2026-09-21T22:00:00.0000000' },
          },
        ],
      },
    });

    const r = await service.escalas();
    const infra = r.escalas.find((e) => e.rotulo === 'Infra')!;
    const sistemas = r.escalas.find((e) => e.rotulo === 'Sistemas')!;

    expect(infra.turnos.map((t) => [t.titulo, t.agora])).toEqual([
      ['Plantão Jonatan', false],
      ['Plantão Alisson', true],
    ]);
    // O turno do Sistemas só começa amanhã: ninguém de plantão agora.
    expect(sistemas.turnos.every((t) => !t.agora)).toBe(true);
  });

  it('pede os horários no fuso de São Paulo', async () => {
    const { service, getJson } = build({ 'ID-INFRA': { value: [] }, 'ID-SIS': { value: [] } });
    await service.escalas();
    const opcoes = getJson.mock.calls[0]?.[1];
    expect(opcoes?.headers?.Prefer).toBe(
      'outlook.timezone="America/Sao_Paulo"',
    );
  });

  it('usa calendarView, que expande a recorrência', async () => {
    const { service, getJson } = build({ 'ID-INFRA': { value: [] }, 'ID-SIS': { value: [] } });
    await service.escalas();
    expect(getJson.mock.calls[0][0]).toContain('/calendarView?');
  });

  it('uma escala que falha não derruba as outras, e diz que falhou', async () => {
    const { service } = build({
      'ID-INFRA': new Error('Graph GET — 403: sem acesso'),
      'ID-SIS': {
        value: [
          {
            subject: 'Plantão Rian',
            start: { dateTime: '2026-09-19T06:00:00.0000000' },
            end: { dateTime: '2026-09-21T22:00:00.0000000' },
          },
        ],
      },
    });

    const r = await service.escalas();
    const infra = r.escalas.find((e) => e.rotulo === 'Infra')!;
    const sistemas = r.escalas.find((e) => e.rotulo === 'Sistemas')!;

    // Falha vira aviso na tela, não cache calado: plantonista errado de
    // madrugada é pior do que bloco vazio.
    expect(infra.erro).toBeTruthy();
    expect(infra.turnos).toEqual([]);
    expect(sistemas.turnos).toHaveLength(1);
    expect(sistemas.erro).toBeNull();
  });

  it('sem configuração, responde que não está configurado', async () => {
    delete process.env.PLANTAO_CALENDARIOS;
    const { service } = build({});
    const r = await service.escalas();
    expect(r.configurado).toBe(false);
    expect(r.escalas).toEqual([]);
  });
});
