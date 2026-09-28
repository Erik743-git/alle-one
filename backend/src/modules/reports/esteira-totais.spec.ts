import { somarEsteira, type EventoEsteira } from './esteira-totais';

const ev = (
  dateRef: string,
  fromTime: string,
  toTime: string,
  minutes: number,
  status = 'APPROVED',
  eventType = 'OVERTIME',
): EventoEsteira => ({ dateRef, fromTime, toTime, minutes, status, eventType });

describe('somarEsteira', () => {
  it('caso Breno (ciclo 26/08–25/09): aprovada sem sobreposição = 15h21, negada 13 min', () => {
    const t = somarEsteira([
      ev('2026-08-28', '18:00', '19:30', 90),
      ev('2026-08-29', '12:00', '23:59', 719),
      ev('2026-08-29', '21:10', '21:20', 10),
      ev('2026-08-29', '21:15', '21:18', 3),
      ev('2026-08-29', '21:20', '21:24', 4),
      ev('2026-08-29', '21:20', '21:25', 5),
      ev('2026-08-29', '21:26', '21:26', 0),
      ev('2026-09-13', '08:00', '09:29', 89),
      ev('2026-09-14', '18:00', '18:05', 5),
      ev('2026-09-14', '18:04', '18:04', 0),
      ev('2026-09-14', '18:04', '18:07', 3),
      ev('2026-09-14', '18:05', '18:11', 6),
      ev('2026-09-21', '18:00', '18:12', 12),
      ev('2026-09-24', '11:34', '11:47', 13, 'REJECTED'),
    ]);
    expect(t.extraAprovada).toBe(921); // 15h21 (antes o relatório dava 946 = 15h46)
    expect(t.extraNegada).toBe(13);
    expect(t.extraPendente).toBe(0);
  });

  it('caso Glaucia: 15 min negados, nada a pagar', () => {
    const t = somarEsteira([
      ev('2026-09-22', '05:00', '05:15', 15, 'REJECTED'),
    ]);
    expect(t).toMatchObject({
      extraAprovada: 0,
      extraNegada: 15,
      extraPendente: 0,
    });
  });

  it('pendente e ativo contam como pendente; plantão separado; dias não se misturam', () => {
    const t = somarEsteira([
      ev('2026-09-01', '10:00', '11:00', 60, 'PENDING'),
      ev('2026-09-02', '10:00', '11:00', 60, 'ACTIVE'),
      ev('2026-09-01', '10:00', '12:00', 120, 'APPROVED', 'PLANTAO'),
      ev('2026-09-01', '11:00', '13:00', 120, 'APPROVED', 'PLANTAO'),
    ]);
    expect(t.extraPendente).toBe(120);
    expect(t.plantaoAprovado).toBe(180);
  });

  it('atravessa a meia-noite pelo horário', () => {
    expect(
      somarEsteira([ev('2026-09-01', '23:00', '01:00', 120)]).extraAprovada,
    ).toBe(120);
  });
});
