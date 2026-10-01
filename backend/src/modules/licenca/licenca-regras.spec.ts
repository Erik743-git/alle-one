import {
  bloqueiaApontamentoSemLicenca,
  contaNoLimite,
  licencaValida,
} from './licenca-regras';

describe('licenciamento de usuário cliente', () => {
  it('licença só vale para cliente responsável', () => {
    expect(licencaValida('CLIENT_GESTOR', true, true)).toBe(true);
    expect(licencaValida('CLIENT_MEMBER', true, true)).toBe(true);
    expect(licencaValida('CLIENT_MEMBER', false, true)).toBe(false);
    expect(licencaValida('COLLABORATOR', true, true)).toBe(false);
    expect(licencaValida('CLIENT_GESTOR', true, false)).toBe(false);
  });

  it('comunicação (0 minuto) não conta no limite', () => {
    expect(contaNoLimite('10:00', '10:00')).toBe(false);
    expect(contaNoLimite('10:00', '10:15')).toBe(true);
  });

  it('cliente sem licença faz 2 apontamentos; o terceiro é bloqueado', () => {
    const base = {
      role: 'CLIENT_MEMBER',
      licenciado: false,
      initTime: '09:00',
      endTime: '10:00',
    };
    expect(bloqueiaApontamentoSemLicenca({ ...base, jaFeitos: 0 })).toBe(false);
    expect(bloqueiaApontamentoSemLicenca({ ...base, jaFeitos: 1 })).toBe(false);
    expect(bloqueiaApontamentoSemLicenca({ ...base, jaFeitos: 2 })).toBe(true);
    // Comunicação continua liberada.
    expect(
      bloqueiaApontamentoSemLicenca({
        ...base,
        jaFeitos: 5,
        initTime: '09:00',
        endTime: '09:00',
      }),
    ).toBe(false);
  });

  it('licenciado e equipe interna não têm limite', () => {
    const base = { initTime: '09:00', endTime: '10:00', jaFeitos: 10 };
    expect(
      bloqueiaApontamentoSemLicenca({
        ...base,
        role: 'CLIENT_GESTOR',
        licenciado: true,
      }),
    ).toBe(false);
    expect(
      bloqueiaApontamentoSemLicenca({
        ...base,
        role: 'COLLABORATOR',
        licenciado: false,
      }),
    ).toBe(false);
    expect(
      bloqueiaApontamentoSemLicenca({ ...base, role: 'PJ', licenciado: false }),
    ).toBe(false);
  });
});
