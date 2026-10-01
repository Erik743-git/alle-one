import {
  horasEsgotadas,
  instanteDoDia,
  mensagemTrava,
  passaPelaTrava,
} from './contrato-trava-regras';

describe('trava de apontamento por contrato', () => {
  it('trava quando as horas usadas chegam ao contratado', () => {
    expect(horasEsgotadas(79, 80)).toBe(false);
    expect(horasEsgotadas(80, 80)).toBe(true);
    expect(horasEsgotadas(81, 80)).toBe(true);
  });

  it('o lançamento que estoura passa: com 79h, o de 2h entra; o seguinte não', () => {
    expect(horasEsgotadas(79, 80)).toBe(false); // entra e vai a 81h
    expect(horasEsgotadas(81, 80)).toBe(true); // o próximo é barrado
  });

  it('linha sem horas não trava', () => {
    expect(horasEsgotadas(10, 0)).toBe(false);
  });

  it('só o admin passa', () => {
    expect(passaPelaTrava('ADMIN')).toBe(true);
    expect(passaPelaTrava('COLLABORATOR')).toBe(false);
    expect(passaPelaTrava('PJ')).toBe(false);
    expect(passaPelaTrava('CLIENT_GESTOR')).toBe(false);
  });

  it('mensagem com contrato, especialidade e horas', () => {
    expect(
      mensagemTrava({
        contrato: 'Infostore DBA',
        especialidade: 'DBA SQL',
        usadas: 80.5,
        contratadas: 80,
      }),
    ).toBe(
      'As horas do contrato "Infostore DBA" (DBA SQL) deste mês acabaram (80h30 de 80h). Entre em contato com o seu gestor.',
    );
  });

  it('dia do apontamento fica no próprio mês em Brasília', () => {
    expect(instanteDoDia('2026-10-01').toISOString()).toBe(
      '2026-10-01T15:00:00.000Z',
    );
  });
});
