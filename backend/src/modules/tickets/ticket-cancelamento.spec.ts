import {
  ehCancelado,
  exigirMotivoCancelamento,
  MOTIVO_CANCELAMENTO_MAXIMO,
} from './ticket-cancelamento';

describe('ticket-cancelamento', () => {
  it('reconhece Cancelado pelos nomes aceitos', () => {
    expect(ehCancelado('Cancelado')).toBe(true);
    expect(ehCancelado(' cancelado ')).toBe(true);
    expect(ehCancelado('Encerrado')).toBe(false);
    expect(ehCancelado(null)).toBe(false);
  });

  it('exige motivo com 10 caracteres ou mais', () => {
    expect(() => exigirMotivoCancelamento(undefined)).toThrow(/motivo/);
    expect(() => exigirMotivoCancelamento('   curto   ')).toThrow(/motivo/);
    expect(exigirMotivoCancelamento('  Cliente desistiu do pedido  ')).toBe(
      'Cliente desistiu do pedido',
    );
    expect(exigirMotivoCancelamento('x'.repeat(2000))).toHaveLength(
      MOTIVO_CANCELAMENTO_MAXIMO,
    );
  });
});
