import { getStoredUser } from "./session";

/**
 * Módulos desligados para quem está logado.
 *
 * Quem decide é Administração → Acesso por perfil: a API manda a lista
 * `modulosDesligados` no login e no /auth/me, e também devolve 403 nas rotas
 * do módulo. Aqui a lista só serve para esconder menu e tela.
 *
 * Sessão salva antes dessa versão não tem a lista até o próximo /auth/me;
 * nesse intervalo vale a variável antiga NEXT_PUBLIC_MODULOS_DESABILITADOS
 * (resolvida no build), para nenhum módulo em construção piscar no menu.
 */

export const MODULO_DASHBOARD = "dashboard";
export const MODULO_TICKETS = "tickets";
export const MODULO_PRE_TICKETS = "pre-tickets";
export const MODULO_MONITORAMENTO = "monitoramento";
export const MODULO_AGENDAS = "agendas";
export const MODULO_MURAL = "mural";
export const MODULO_OPORTUNIDADES = "oportunidades";
export const MODULO_FINANCEIRO = "financeiro";
export const MODULO_GMUD = "gmud";
export const MODULO_RELATORIOS = "relatorios";
export const MODULO_APONTAMENTOS = "apontamentos";
/** Aba "Carga da equipe" de Apontamentos (começa só para admin). */
export const MODULO_CARGA_EQUIPE = "carga-equipe";
/** Bloco de somatório de horas no topo do calendário de Apontamentos. */
export const MODULO_HORAS_APONTAMENTOS = "apontamentos-horas";
export const MODULO_INVENTARIO = "inventario";
export const MODULO_PROJETOS = "projetos";
export const MODULO_APLICATIVOS = "aplicativos";

function normalizar(valor: string): string {
  const v = valor.trim().toLowerCase();
  // Nome antigo usado na variável de ambiente.
  return v === "horas-apontamentos" ? MODULO_HORAS_APONTAMENTOS : v;
}

const daVariavel = new Set(
  (process.env.NEXT_PUBLIC_MODULOS_DESABILITADOS ?? "")
    .split(",")
    .map(normalizar)
    .filter(Boolean),
);

export function moduloDesabilitado(nome: string): boolean {
  const user = getStoredUser();
  if (user?.role === "ADMIN") return false;
  const lista = user?.modulosDesligados;
  if (Array.isArray(lista)) return lista.includes(normalizar(nome));
  return daVariavel.has(normalizar(nome));
}
