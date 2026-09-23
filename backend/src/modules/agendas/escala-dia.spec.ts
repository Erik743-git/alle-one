import {
  deTurnoEm,
  diaDaSemana,
  somarDias,
  turnosDoDia,
  type EscalaExcecaoDia,
  type EscalaRegraDia,
} from './escala-dia';

// 2026-09-21 é segunda-feira.
const SEG = '2026-09-21';
const TER = '2026-09-22';
const QUA = '2026-09-23';

function regra(over: Partial<EscalaRegraDia> = {}): EscalaRegraDia {
  return {
    id: 'r1',
    userId: 'u-ana',
    userName: 'Ana',
    specialtyName: 'Sistemas',
    startTime: '08:00',
    endTime: '17:00',
    daysOfWeek: [1, 2, 3, 4, 5],
    validFrom: '2026-01-01',
    validTo: null,
    ...over,
  };
}

function excecao(over: Partial<EscalaExcecaoDia> = {}): EscalaExcecaoDia {
  return {
    id: 'e1',
    regraId: 'r1',
    date: SEG,
    tipo: 'FOLGA',
    substituteUserId: null,
    substituteName: null,
    startTime: null,
    endTime: null,
    motivo: null,
    ...over,
  };
}

const h = (hora: number, minuto = 0) => hora * 60 + minuto;

describe('datas sem fuso', () => {
  it('sabe o dia da semana', () => {
    expect(diaDaSemana(SEG)).toBe(1);
    expect(diaDaSemana('2026-09-27')).toBe(0);
  });

  it('soma dias atravessando o mês', () => {
    expect(somarDias('2026-09-30', 1)).toBe('2026-10-01');
    expect(somarDias('2026-10-01', -1)).toBe('2026-09-30');
  });
});

describe('turnosDoDia', () => {
  it('turno comum aparece no dia em que vale', () => {
    const [t] = turnosDoDia(SEG, [regra()], []);
    expect(t).toMatchObject({ userName: 'Ana', inicio: h(8), fim: h(17) });
  });

  it('não aparece em dia da semana fora da regra', () => {
    expect(turnosDoDia(SEG, [regra({ daysOfWeek: [2] })], [])).toEqual([]);
  });

  it('respeita o período de validade', () => {
    const r = regra({ validFrom: TER, validTo: TER });
    expect(turnosDoDia(SEG, [r], [])).toEqual([]);
    expect(turnosDoDia(TER, [r], [])).toHaveLength(1);
    expect(turnosDoDia(QUA, [r], [])).toEqual([]);
  });

  describe('turno que cruza a meia-noite (22h às 6h, só segunda)', () => {
    const noturno = regra({ startTime: '22:00', endTime: '06:00', daysOfWeek: [1] });

    it('na segunda aparece das 22h até depois da meia-noite', () => {
      const [t] = turnosDoDia(SEG, [noturno], []);
      expect(t).toMatchObject({ inicio: h(22), fim: h(30), diaDoTurno: SEG });
    });

    it('na terça aparece a madrugada, como turno da segunda', () => {
      const [t] = turnosDoDia(TER, [noturno], []);
      expect(t).toMatchObject({ inicio: h(-2), fim: h(6), diaDoTurno: SEG });
    });

    it('na terça às 3h a pessoa está de turno', () => {
      const turnos = turnosDoDia(TER, [noturno], []);
      expect(deTurnoEm(turnos, h(3)).map((t) => t.userName)).toEqual(['Ana']);
    });

    it('na quarta não sobra nada da segunda', () => {
      expect(turnosDoDia(QUA, [noturno], [])).toEqual([]);
    });

    it('turno de ontem que acabou antes da meia-noite não vaza para hoje', () => {
      const tarde = regra({ startTime: '14:00', endTime: '20:00', daysOfWeek: [1] });
      expect(turnosDoDia(TER, [tarde], [])).toEqual([]);
    });
  });

  describe('exceções', () => {
    it('folga do turno inteiro deixa o turno vago', () => {
      expect(turnosDoDia(SEG, [regra()], [excecao()])).toEqual([]);
    });

    it('folga vale só para o dia dela', () => {
      expect(turnosDoDia(TER, [regra()], [excecao()])).toHaveLength(1);
    });

    it('troca do turno inteiro põe o substituto no lugar', () => {
      const turnos = turnosDoDia(
        SEG,
        [regra()],
        [excecao({ tipo: 'TROCA', substituteUserId: 'u-bia', substituteName: 'Bia' })],
      );
      expect(turnos).toHaveLength(1);
      expect(turnos[0]).toMatchObject({
        userName: 'Bia',
        origem: 'TROCA',
        substituiu: 'Ana',
        inicio: h(8),
        fim: h(17),
      });
    });

    it('troca recortada divide o turno em três pedaços', () => {
      const turnos = turnosDoDia(
        SEG,
        [regra()],
        [
          excecao({
            tipo: 'TROCA',
            substituteUserId: 'u-bia',
            substituteName: 'Bia',
            startTime: '12:00',
            endTime: '14:00',
          }),
        ],
      );
      expect(turnos.map((t) => [t.userName, t.inicio, t.fim])).toEqual([
        ['Ana', h(8), h(12)],
        ['Bia', h(12), h(14)],
        ['Ana', h(14), h(17)],
      ]);
    });

    it('folga recortada deixa só o recorte vago', () => {
      const turnos = turnosDoDia(
        SEG,
        [regra()],
        [excecao({ startTime: '08:00', endTime: '10:00' })],
      );
      expect(turnos.map((t) => [t.inicio, t.fim])).toEqual([[h(10), h(17)]]);
    });

    it('recorte da madrugada cai no turno que começou na véspera', () => {
      const noturno = regra({ startTime: '22:00', endTime: '06:00', daysOfWeek: [1] });
      // Troca feita no turno de segunda, das 2h às 6h (já terça).
      const troca = excecao({
        date: SEG,
        tipo: 'TROCA',
        substituteUserId: 'u-bia',
        substituteName: 'Bia',
        startTime: '02:00',
        endTime: '06:00',
      });
      const terca = turnosDoDia(TER, [noturno], [troca]);
      expect(terca.map((t) => [t.userName, t.inicio, t.fim])).toEqual([
        ['Ana', h(-2), h(2)],
        ['Bia', h(2), h(6)],
      ]);
    });

    it('exceção de outra regra não mexe nesta', () => {
      const turnos = turnosDoDia(SEG, [regra()], [excecao({ regraId: 'outra' })]);
      expect(turnos).toHaveLength(1);
    });
  });

  it('duas pessoas no mesmo horário aparecem as duas', () => {
    const turnos = turnosDoDia(
      SEG,
      [regra(), regra({ id: 'r2', userId: 'u-caio', userName: 'Caio' })],
      [],
    );
    expect(deTurnoEm(turnos, h(9)).map((t) => t.userName)).toEqual(['Ana', 'Caio']);
  });

  it('horário inválido é ignorado em vez de quebrar a tela', () => {
    expect(turnosDoDia(SEG, [regra({ startTime: 'xx' })], [])).toEqual([]);
  });
});
