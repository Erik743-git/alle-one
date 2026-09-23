/**
 * Comunicação com o cliente x apontamento de horas.
 *
 * O portal grava comunicação como apontamento de duração zero — início igual
 * ao fim. É assim tanto na tela do chamado (ticket-appointment-modal:
 * "Comunicação: alerta sem horas trabalhadas (início = fim no clique)")
 * quanto na resposta de e-mail que vira comunicação
 * (email-reply-communication, que usa o mesmo horário nos dois campos).
 *
 * Na tela de Apontamentos essas linhas só poluem: não somam hora nenhuma e o
 * gestor acompanha a conversa com o cliente pelo chamado, não pela folha.
 *
 * A regra exige os dois horários preenchidos e iguais. Linha antiga com
 * horário nulo continua aparecendo de propósito: ali o zero é dado quebrado,
 * e esconder o defeito é pior do que mostrá-lo.
 */
export function isComunicacaoSemHoras(
  initTime: string | null | undefined,
  endTime: string | null | undefined,
): boolean {
  const init = initTime?.slice(0, 5);
  const end = endTime?.slice(0, 5);
  return Boolean(init && end && init === end);
}
