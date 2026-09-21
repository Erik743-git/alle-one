import { PORTAL_STAGE } from './portal-ticket-stages';

/**
 * Estágio e status de um chamado ao salvar.
 *
 * São a mesma informação em dois campos e o cabeçalho mostra os dois lado
 * a lado. Quando um andava sem o outro apareciam chamados como o #81649:
 * fechado, mas exibido como "Novo · Encerrado" — e, no caso em que o
 * estágio é que ficava para trás, o chamado nem saía da fila, porque a
 * fila se guia pelo estágio.
 */
function resolver(params: {
  stageName?: string | null;
  statusName?: string | null;
  isClosed?: boolean;
  atual: { stageName: string | null; statusName: string | null; isClosed: boolean };
}) {
  const { stageName, statusName, atual } = params;
  const dtoIsClosed = params.isClosed;
  const reopening = atual.isClosed && dtoIsClosed === false;
  const fechandoSemEstagio = dtoIsClosed === true && !stageName;

  const resolvedStageName =
    stageName ??
    (reopening
      ? PORTAL_STAGE.NOVO
      : fechandoSemEstagio
        ? PORTAL_STAGE.ENCERRADO
        : (atual.stageName ?? null));

  const resolvedStatusName =
    statusName ??
    (reopening
      ? PORTAL_STAGE.NOVO
      : dtoIsClosed === true
        ? PORTAL_STAGE.ENCERRADO
        : (resolvedStageName ?? atual.statusName ?? null));

  return { stage: resolvedStageName, status: resolvedStatusName };
}

const novoAberto = {
  stageName: PORTAL_STAGE.NOVO,
  statusName: PORTAL_STAGE.NOVO,
  isClosed: false,
};

describe('estágio e status ao salvar o chamado', () => {
  it('fechar sem informar estágio move o estágio junto', () => {
    // Antes o estágio ficava em "Novo" e o chamado, mesmo fechado,
    // continuava aparecendo na fila de quem atendia.
    const r = resolver({ isClosed: true, atual: novoAberto });
    expect(r.stage).toBe(PORTAL_STAGE.ENCERRADO);
    expect(r.status).toBe(PORTAL_STAGE.ENCERRADO);
  });

  it('fechar como Resolvido respeita o estágio escolhido', () => {
    const r = resolver({
      isClosed: true,
      stageName: PORTAL_STAGE.RESOLVIDO,
      statusName: PORTAL_STAGE.RESOLVIDO,
      atual: novoAberto,
    });
    expect(r.stage).toBe(PORTAL_STAGE.RESOLVIDO);
    expect(r.status).toBe(PORTAL_STAGE.RESOLVIDO);
  });

  it('fechar como Cancelado respeita o estágio escolhido', () => {
    const r = resolver({
      isClosed: true,
      stageName: PORTAL_STAGE.CANCELADO,
      atual: novoAberto,
    });
    expect(r.stage).toBe(PORTAL_STAGE.CANCELADO);
  });

  it('reabrir volta os dois para Novo', () => {
    const r = resolver({
      isClosed: false,
      atual: {
        stageName: PORTAL_STAGE.ENCERRADO,
        statusName: PORTAL_STAGE.ENCERRADO,
        isClosed: true,
      },
    });
    expect(r.stage).toBe(PORTAL_STAGE.NOVO);
    expect(r.status).toBe(PORTAL_STAGE.NOVO);
  });

  it('mudar só o estágio leva o status junto', () => {
    const r = resolver({ stageName: 'Em Atendimento', atual: novoAberto });
    expect(r.stage).toBe('Em Atendimento');
    expect(r.status).toBe('Em Atendimento');
  });

  it('salvar outra coisa não bagunça estágio nem status', () => {
    const emAtendimento = {
      stageName: 'Em Atendimento',
      statusName: 'Em Atendimento',
      isClosed: false,
    };
    const r = resolver({ atual: emAtendimento });
    expect(r.stage).toBe('Em Atendimento');
    expect(r.status).toBe('Em Atendimento');
  });

  it('alinha o status quando o registro antigo estava torto', () => {
    // Registro gravado antes da correção: fechado no estágio, status parado.
    const torto = {
      stageName: PORTAL_STAGE.ENCERRADO,
      statusName: PORTAL_STAGE.NOVO,
      isClosed: true,
    };
    const r = resolver({ atual: torto });
    expect(r.status).toBe(PORTAL_STAGE.ENCERRADO);
  });
});
