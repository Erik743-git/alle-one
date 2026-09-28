import { ContratoAvisoService } from './contrato-aviso.service';

/**
 * A rotina de ponta a ponta com o banco simulado: é ela que decide mandar
 * e-mail e abrir oportunidade, então o que importa é o que sai para fora.
 */
type LinhaFake = {
  id: string;
  monthlyHours: number;
  especialidade: string;
  titulo: string;
};

function montar(opts: {
  linhas: LinhaFake[];
  minutosPorMesa: Record<string, number>;
  jaAvisadas?: Array<{ contractSpecialtyId: string; faixa: number }>;
  oportunidadeAberta?: boolean;
}) {
  const registros = new Set(
    (opts.jaAvisadas ?? []).map((a) => `${a.contractSpecialtyId}:${a.faixa}`),
  );
  const prisma = {
    contractSpecialty: {
      findMany: jest.fn(async () =>
        opts.linhas.map((l) => ({
          id: l.id,
          monthlyHours: l.monthlyHours,
          specialty: { name: l.especialidade },
          contract: {
            title: l.titulo,
            company: { id: 'emp1', name: 'Fluidra' },
          },
        })),
      ),
    },
    contratoAvisoLinha: {
      findMany: jest.fn(async () => opts.jaAvisadas ?? []),
      createMany: jest.fn(
        async ({
          data,
        }: {
          data: Array<{ contractSpecialtyId: string; faixa: number }>;
        }) => {
          let count = 0;
          for (const d of data) {
            const k = `${d.contractSpecialtyId}:${d.faixa}`;
            if (!registros.has(k)) {
              registros.add(k);
              count += 1;
            }
          }
          return { count };
        },
      ),
      update: jest.fn(async () => ({})),
    },
    user: {
      findMany: jest.fn(async () => [{ id: 'adm', email: 'adm@alle.com' }]),
    },
    oportunidade: {
      findFirst: jest.fn(async () =>
        opts.oportunidadeAberta ? { id: 'op-velha' } : null,
      ),
    },
    mailboxNotification: { createMany: jest.fn(async () => ({ count: 1 })) },
  };
  const dashboard = {
    getDashboardHours: jest.fn(async () => ({
      summary: { totalHoras: 0 },
      horasPorMesa: Object.entries(opts.minutosPorMesa).map(
        ([deskName, totalMinutes]) => ({ deskName, totalMinutes }),
      ),
    })),
  };
  const mail = { sendMail: jest.fn(async (_m: unknown) => true) };
  const oportunidades = {
    pessoasDoComercial: jest.fn(async () => [
      { id: 'com', email: 'comercial@alle.com' },
    ]),
    criarAutomatica: jest.fn(async (_c: unknown) => ({ id: 'op-nova' })),
  };
  const svc = new ContratoAvisoService(
    prisma as never,
    dashboard as never,
    mail as never,
    oportunidades as never,
  );
  return { svc, prisma, dashboard, mail, oportunidades };
}

type EmailEnviado = { to: string[]; subject: string; text: string };

// 20/09 10h de Brasília: fora da janela do dia 15.
const diaComum = new Date('2026-09-20T13:00:00Z');
// 15/09 08:20 de Brasília.
const dia15 = new Date('2026-09-15T11:20:00Z');

const sistemas: LinhaFake = {
  id: 'l-sis',
  monthlyHours: 20,
  especialidade: 'Sistemas',
  titulo: 'Contrato Datasul',
};
const infra: LinhaFake = {
  id: 'l-inf',
  monthlyHours: 10,
  especialidade: 'Infraestrutura',
  titulo: 'Contrato Datasul',
};

describe('aviso de contrato por linha', () => {
  it('cada linha conta só as horas da própria especialidade', async () => {
    // Sistemas 17h de 20h = 85%; Infra 3h de 10h = 30%.
    const { svc, mail } = montar({
      linhas: [sistemas, infra],
      minutosPorMesa: { Sistemas: 17 * 60, Infraestrutura: 3 * 60 },
    });
    const r = await svc.verificar(diaComum);

    expect(r.avisos).toBe(1);
    const email = mail.sendMail.mock.calls[0][0] as EmailEnviado;
    expect(email.subject).toBe('[Contrato 80%] Fluidra — Sistemas');
    expect(email.text).toContain('Cliente: Fluidra');
    expect(email.text).toContain('Contrato: Contrato Datasul');
    expect(email.text).toContain('Especialidade: Sistemas');
    expect(email.text).toContain('17h00 usadas de 20h00 contratadas (85%)');
    // Admins e mesa Comercial; o cliente não recebe.
    expect(email.to).toEqual(['adm@alle.com', 'comercial@alle.com']);
  });

  it('não repete a faixa já avisada no mês', async () => {
    const { svc, mail } = montar({
      linhas: [sistemas],
      minutosPorMesa: { Sistemas: 17 * 60 },
      jaAvisadas: [
        { contractSpecialtyId: 'l-sis', faixa: 50 },
        { contractSpecialtyId: 'l-sis', faixa: 80 },
      ],
    });
    await svc.verificar(diaComum);
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it('com tudo avisado e fora do dia 15, nem calcula as horas', async () => {
    const { svc, dashboard } = montar({
      linhas: [sistemas],
      minutosPorMesa: { Sistemas: 0 },
      jaAvisadas: [50, 80, 100].map((faixa) => ({
        contractSpecialtyId: 'l-sis',
        faixa,
      })),
    });
    await svc.verificar(diaComum);
    expect(dashboard.getDashboardHours).not.toHaveBeenCalled();
  });

  it('em 100% abre a oportunidade de renovação', async () => {
    const { svc, oportunidades, mail } = montar({
      linhas: [sistemas],
      minutosPorMesa: { Sistemas: 21 * 60 },
    });
    const r = await svc.verificar(diaComum);
    expect(r.oportunidades).toBe(1);
    expect(oportunidades.criarAutomatica).toHaveBeenCalledTimes(1);
    const email = mail.sendMail.mock.calls[0][0] as EmailEnviado;
    expect(email.subject).toBe('[Contrato 100%] Fluidra — Sistemas');
    expect(email.text).toContain('Foi aberta uma oportunidade');
  });

  it('não abre segunda oportunidade se já há uma aberta para a empresa', async () => {
    const { svc, oportunidades, mail } = montar({
      linhas: [sistemas],
      minutosPorMesa: { Sistemas: 21 * 60 },
      oportunidadeAberta: true,
    });
    await svc.verificar(diaComum);
    expect(oportunidades.criarAutomatica).not.toHaveBeenCalled();
    const email = mail.sendMail.mock.calls[0][0] as EmailEnviado;
    expect(email.text).toContain('Já existe uma oportunidade de renovação');
  });

  it('dia 15 às 8h: avisa a linha em 50% ou menos, uma vez', async () => {
    const { svc, mail } = montar({
      linhas: [infra],
      minutosPorMesa: { Infraestrutura: 3 * 60 },
    });
    await svc.verificar(dia15);
    expect(mail.sendMail).toHaveBeenCalledTimes(1);
    const email = mail.sendMail.mock.calls[0][0] as EmailEnviado;
    expect(email.subject).toBe(
      '[Contrato no dia 15: 30%] Fluidra — Infraestrutura',
    );

    // A rotina da hora seguinte não manda de novo.
    await svc.verificar(new Date('2026-09-15T12:20:00Z'));
    expect(mail.sendMail).toHaveBeenCalledTimes(1);
  });

  it('fora do dia 15 a linha abaixo de 50% não gera aviso', async () => {
    const { svc, mail } = montar({
      linhas: [infra],
      minutosPorMesa: { Infraestrutura: 3 * 60 },
    });
    await svc.verificar(diaComum);
    expect(mail.sendMail).not.toHaveBeenCalled();
  });
});
