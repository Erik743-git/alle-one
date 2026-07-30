import {
  canonicalizeStageName,
  resolveTicketStageGroup,
} from './tickets-stage-groups';

describe('resolveTicketStageGroup', () => {
  it('agrupa estágios conhecidos', () => {
    expect(resolveTicketStageGroup('Pendente')).toBe('pendente');
    expect(resolveTicketStageGroup('Aguardando usuário')).toBe('aguardando');
    expect(resolveTicketStageGroup('Em execução')).toBe('execucao');
  });

  it('normaliza acentos e caixa', () => {
    expect(resolveTicketStageGroup('AGUARDANDO USUÁRIO')).toBe('aguardando');
    expect(resolveTicketStageGroup('Em Execução')).toBe('execucao');
  });

  it('aceita aliases em inglês', () => {
    expect(resolveTicketStageGroup('Pending')).toBe('pendente');
    expect(resolveTicketStageGroup('In progress')).toBe('execucao');
  });

  it('cai em outros para estágio desconhecido', () => {
    expect(resolveTicketStageGroup('Fechado')).toBe('outros');
    expect(resolveTicketStageGroup(null)).toBe('outros');
  });
});

describe('canonicalizeStageName', () => {
  it('unifica casing e aliases', () => {
    expect(canonicalizeStageName('Em Execução')).toBe('Em execução');
    expect(canonicalizeStageName('Pending')).toBe('Pendente');
    expect(canonicalizeStageName('Aguardando Usuário')).toBe(
      'Aguardando usuário',
    );
  });

  it('preserva estágios desconhecidos', () => {
    expect(canonicalizeStageName('Aberto')).toBe('Aberto');
  });
});
