import {
  diaLocal,
  diasDosTrechos,
  foraDasJanelas,
  horaLocal,
  intervalosDaJanela,
  situacaoDaGmud,
  unirIntervalos,
  type JanelaDef,
} from './manutencao-janela';

// 2026-09-22 é terça-feira. Brasília = UTC-3.
const TER = '2026-09-22';
const QUA = '2026-09-23';

const utc = (iso: string) => new Date(iso);

function recorrente(over: Partial<JanelaDef> = {}): JanelaDef {
  return {
    recorrente: true,
    daysOfWeek: [2],
    startTime: '22:00',
    endTime: '06:00',
    validFrom: null,
    validTo: null,
    inicio: null,
    fim: null,
    ...over,
  };
}

describe('fuso de Brasília', () => {
  it('22h de terça em Brasília é 01h de quarta em UTC', () => {
    expect(horaLocal(TER, 22 * 60).toISOString()).toBe(
      '2026-09-23T01:00:00.000Z',
    );
  });

  it('minutos acima de um dia caem no dia seguinte', () => {
    expect(horaLocal(TER, 24 * 60 + 6 * 60).toISOString()).toBe(
      '2026-09-23T09:00:00.000Z',
    );
  });

  it('dia local de um instante de madrugada UTC ainda é a véspera', () => {
    expect(diaLocal(utc('2026-09-23T02:00:00Z'))).toBe(TER);
  });
});

describe('intervalosDaJanela', () => {
  it('recorrente noturna vira um intervalo que cruza a meia-noite', () => {
    const [i] = intervalosDaJanela(recorrente(), TER, TER);
    expect(i.inicio.toISOString()).toBe('2026-09-23T01:00:00.000Z');
    expect(i.fim.toISOString()).toBe('2026-09-23T09:00:00.000Z');
  });

  it('a janela da véspera entra para cobrir a madrugada', () => {
    const out = intervalosDaJanela(recorrente(), QUA, QUA);
    expect(out).toHaveLength(1);
    expect(diaLocal(out[0].inicio)).toBe(TER);
  });

  it('respeita dias da semana e validade', () => {
    expect(
      intervalosDaJanela(recorrente({ daysOfWeek: [4] }), TER, QUA),
    ).toEqual([]);
    expect(
      intervalosDaJanela(recorrente({ validFrom: QUA }), TER, QUA),
    ).toEqual([]);
  });

  it('avulsa devolve o próprio intervalo', () => {
    const avulsa: JanelaDef = {
      ...recorrente(),
      recorrente: false,
      inicio: utc('2026-09-25T12:00:00Z'),
      fim: utc('2026-09-25T15:00:00Z'),
    };
    expect(intervalosDaJanela(avulsa, TER, QUA)).toEqual([
      { inicio: avulsa.inicio, fim: avulsa.fim },
    ]);
  });
});

describe('unirIntervalos e foraDasJanelas', () => {
  const j = (a: string, b: string) => ({ inicio: utc(a), fim: utc(b) });

  it('junta janelas encostadas', () => {
    const out = unirIntervalos([
      j('2026-09-23T03:00:00Z', '2026-09-23T09:00:00Z'),
      j('2026-09-23T01:00:00Z', '2026-09-23T03:00:00Z'),
    ]);
    expect(out).toEqual([j('2026-09-23T01:00:00Z', '2026-09-23T09:00:00Z')]);
  });

  it('trecho que atravessa duas janelas encostadas fica dentro', () => {
    expect(
      foraDasJanelas(j('2026-09-23T02:00:00Z', '2026-09-23T05:00:00Z'), [
        j('2026-09-23T01:00:00Z', '2026-09-23T03:00:00Z'),
        j('2026-09-23T03:00:00Z', '2026-09-23T09:00:00Z'),
      ]),
    ).toEqual([]);
  });

  it('devolve só o pedaço que sobra fora', () => {
    expect(
      foraDasJanelas(j('2026-09-23T08:00:00Z', '2026-09-23T10:00:00Z'), [
        j('2026-09-23T01:00:00Z', '2026-09-23T09:00:00Z'),
      ]),
    ).toEqual([j('2026-09-23T09:00:00Z', '2026-09-23T10:00:00Z')]);
  });

  it('sobras dos dois lados e de um buraco no meio', () => {
    expect(
      foraDasJanelas(j('2026-09-23T00:00:00Z', '2026-09-23T10:00:00Z'), [
        j('2026-09-23T01:00:00Z', '2026-09-23T03:00:00Z'),
        j('2026-09-23T04:00:00Z', '2026-09-23T09:00:00Z'),
      ]),
    ).toEqual([
      j('2026-09-23T00:00:00Z', '2026-09-23T01:00:00Z'),
      j('2026-09-23T03:00:00Z', '2026-09-23T04:00:00Z'),
      j('2026-09-23T09:00:00Z', '2026-09-23T10:00:00Z'),
    ]);
  });
});

describe('situacaoDaGmud', () => {
  const janelas = intervalosDaJanela(recorrente(), TER, QUA);
  // 23h de terça até 01h de quarta, em Brasília.
  const madrugada = {
    inicio: horaLocal(TER, 23 * 60),
    fim: horaLocal(TER, 25 * 60),
  };
  // 10h de quarta, em Brasília.
  const manha = {
    inicio: horaLocal(QUA, 10 * 60),
    fim: horaLocal(QUA, 11 * 60),
  };

  it('dentro da janela noturna', () => {
    expect(situacaoDaGmud([madrugada], janelas, true).situacao).toBe('DENTRO');
  });

  it('um trecho fora basta para avisar, e diz qual pedaço', () => {
    const r = situacaoDaGmud([madrugada, manha], janelas, true);
    expect(r.situacao).toBe('FORA');
    expect(r.fora).toEqual([manha]);
  });

  it('empresa sem janela não é aviso, é falta de cadastro', () => {
    expect(situacaoDaGmud([manha], [], false)).toEqual({
      situacao: 'SEM_JANELA',
      fora: [],
    });
  });

  it('dias tocados pelos trechos, em Brasília', () => {
    expect(diasDosTrechos([madrugada, manha])).toEqual({ de: TER, ate: QUA });
    expect(diasDosTrechos([])).toBeNull();
  });
});
