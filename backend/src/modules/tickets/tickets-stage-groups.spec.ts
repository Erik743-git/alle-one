import { resolveTicketStageGroup } from './tickets-stage-groups';

describe('resolveTicketStageGroup', () => {
  it('agrupa estágios conhecidos', () => {
    expect(resolveTicketStageGroup('Pendente')).toBe('pendente');
    expect(resolveTicketStageGroup('Aguardando usuário')).toBe('aguardando');
    expect(resolveTicketStageGroup('Em execução')).toBe('execucao');
  });

  it('normaliza acentos e caixa', () => {
    expect(resolveTicketStageGroup('AGUARDANDO USUÁRIO')).toBe('aguardando');
  });

  it('cai em outros para estágio desconhecido', () => {
    expect(resolveTicketStageGroup('Fechado')).toBe('outros');
    expect(resolveTicketStageGroup(null)).toBe('outros');
  });
});
