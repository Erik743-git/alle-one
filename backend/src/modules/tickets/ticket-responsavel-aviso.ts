/**
 * Decide se quem acabou de virar responsável recebe aviso por e-mail.
 *
 * Fica separado do `updateTicket` para a regra ser testável sem banco — e
 * porque a regra é justamente a parte que não pode errar: aviso a mais vira
 * spam, e aviso vindo da automação diria "fulano te colocou" quando quem
 * escolheu foi uma regra.
 */
export function deveAvisarNovoResponsavel(params: {
  /**
   * Só a edição feita na tela liga. A automação também passa pelo
   * `updateTicket` para trocar responsável, e o "ator" dela é quem disparou o
   * evento (ou quem criou a regra) — não quem escolheu o responsável.
   */
  ligado: boolean | undefined;
  /** O responsável mudou de fato: salvar de novo com o mesmo não conta. */
  atribuindo: boolean;
  emailNovoResponsavel: string | null | undefined;
  emailAtor: string | null | undefined;
}): boolean {
  if (!params.ligado || !params.atribuindo) return false;

  const novo = params.emailNovoResponsavel?.trim().toLowerCase() ?? '';
  if (!novo) return false;

  // Quem se coloca como responsável ("puxar para mim") não recebe aviso do
  // que acabou de fazer.
  const ator = params.emailAtor?.trim().toLowerCase() ?? '';
  return novo !== ator;
}
