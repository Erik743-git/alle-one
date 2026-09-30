import ExcelJS from 'exceljs';
import {
  TIPO_CHAMADOS_ATENDIDOS,
  TODOS_OS_TIPOS,
  apontamentosComHoras,
  chamadosAtendidosXlsx,
  limitesBrasilia,
  minutosPorChamado,
  tiposDeRelatorioDoPerfil,
} from './reports-chamados-atendidos';

describe('relatórios por perfil', () => {
  it('cliente gestor só tem o de chamados atendidos', () => {
    expect(tiposDeRelatorioDoPerfil('CLIENT_GESTOR')).toEqual([
      TIPO_CHAMADOS_ATENDIDOS,
    ]);
    // CLIENT é o papel antigo de gestor.
    expect(tiposDeRelatorioDoPerfil('CLIENT')).toEqual([
      TIPO_CHAMADOS_ATENDIDOS,
    ]);
  });

  it('cliente membro não tem nenhum', () => {
    expect(tiposDeRelatorioDoPerfil('CLIENT_MEMBER')).toEqual([]);
  });

  it('a equipe continua com todos', () => {
    expect(tiposDeRelatorioDoPerfil('ADMIN')).toEqual(TODOS_OS_TIPOS);
    expect(tiposDeRelatorioDoPerfil('COLLABORATOR')).toEqual(TODOS_OS_TIPOS);
  });
});

describe('período em Brasília', () => {
  it('vai das 00h do primeiro dia às 23h59 do último, em Brasília', () => {
    expect(limitesBrasilia('2026-09-01', '2026-09-30')).toEqual({
      inicio: '2026-09-01T03:00:00.000Z',
      fim: '2026-10-01T02:59:59.999Z',
    });
  });

  it('chamado aberto às 22h de 30/09 em Brasília conta em setembro', () => {
    const { fim } = limitesBrasilia('2026-09-01', '2026-09-30');
    // 22h de Brasília = 01h UTC do dia seguinte.
    expect(new Date('2026-10-01T01:00:00Z') <= new Date(fim)).toBe(true);
  });
});

describe('apontamentos do relatório', () => {
  const base = {
    ticket_number: 10,
    appointment_date: '2026-09-15',
    executor: 'Yan Costa',
    descricao: 'Ajuste no servidor',
  };

  it('comunicação (início = fim) fica de fora', () => {
    const r = apontamentosComHoras([
      { ...base, init_time: '09:00', end_time: '09:00' },
      { ...base, init_time: '09:00', end_time: '10:30' },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].minutos).toBe(90);
  });

  it('apontamento que passa da meia-noite soma certo', () => {
    const [a] = apontamentosComHoras([
      { ...base, init_time: '23:30', end_time: '00:15' },
    ]);
    expect(a.minutos).toBe(45);
  });

  it('horas por chamado somam os apontamentos dele', () => {
    const lista = apontamentosComHoras([
      { ...base, init_time: '09:00', end_time: '10:00' },
      { ...base, init_time: '14:00', end_time: '14:30' },
      { ...base, ticket_number: 11, init_time: '08:00', end_time: '08:20' },
    ]);
    const total = minutosPorChamado(lista);
    expect(total.get(10)).toBe(90);
    expect(total.get(11)).toBe(20);
  });
});

describe('planilha', () => {
  it('tem as abas Chamados e Apontamentos, sem hora extra nem plantão', async () => {
    const buffer = await chamadosAtendidosXlsx({
      empresa: 'Alle Cliente Demonstração',
      diaInicio: '2026-09-01',
      diaFim: '2026-09-30',
      geradoEm: '30/09/2026 10:00:00',
      chamados: [
        {
          ticket_number: 10,
          title: 'Servidor fora',
          requestor_name: 'Juliana',
          responsible_name: 'Yan Costa',
          desk_name: 'Infraestrutura',
          stage_name: 'Fechado',
          aberto_em: new Date('2026-09-10T12:00:00Z'),
          fechado_em: new Date('2026-09-12T18:00:00Z'),
        },
      ],
      apontamentos: apontamentosComHoras([
        {
          ticket_number: 10,
          appointment_date: '2026-09-11',
          init_time: '09:00',
          end_time: '10:30',
          executor: 'Yan Costa',
          descricao: 'Reinício do serviço',
        },
      ]),
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const chamados = wb.getWorksheet('Chamados')!;
    const apontamentos = wb.getWorksheet('Apontamentos')!;

    expect(chamados.getRow(4).values).toEqual([
      undefined,
      'Nº',
      'Título',
      'Aberto em',
      'Solicitante',
      'Responsável',
      'Mesa',
      'Estágio',
      'Fechado em',
      'Horas no período',
    ]);
    expect(chamados.getCell('A2').value).toContain('01/09/2026 a 30/09/2026');
    expect(chamados.getCell('D5').value).toBe('Juliana');
    // 1h30 gravada como duração; relida, o ExcelJS devolve como hora do "dia zero".
    expect((chamados.getCell('I5').value as Date).toISOString()).toBe(
      '1899-12-30T01:30:00.000Z',
    );

    const cabecalho = (apontamentos.getRow(4).values as unknown[]).join('|');
    expect(cabecalho).toContain('Quem executou');
    expect(cabecalho).not.toMatch(/extra|plant|equipe/i);
    expect(apontamentos.getCell('G5').value).toBe('Yan Costa');
  });
});
