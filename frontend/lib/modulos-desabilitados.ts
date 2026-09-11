/**
 * Desligamento temporário de módulos por ambiente.
 *
 * Serve para tirar algo do ar em produção sem remover o código, enquanto a
 * funcionalidade é reavaliada — o teste segue com tudo ligado, porque é lá que
 * a reavaliação acontece. Por isso a lista vem de variável de ambiente, e não
 * de constante no código: o mesmo build se comporta conforme o ambiente.
 *
 * `NEXT_PUBLIC_*` é resolvido em tempo de build no Next, então a variável
 * precisa estar definida ANTES do `npm run build` do ambiente em questão —
 * definir depois e só reiniciar não muda nada.
 *
 * Para religar um módulo: tire o nome da variável em produção e rebuilde.
 * Nenhum código precisa ser alterado.
 *
 * Exemplo no .env de produção:
 *   NEXT_PUBLIC_MODULOS_DESABILITADOS=financeiro,inventario,projetos,horas-apontamentos
 */

export const MODULO_FINANCEIRO = "financeiro";
export const MODULO_INVENTARIO = "inventario";
export const MODULO_PROJETOS = "projetos";
/** Bloco de somatório de horas no topo do calendário de Apontamentos. */
export const MODULO_HORAS_APONTAMENTOS = "horas-apontamentos";

function normalizar(valor: string): string {
  return valor.trim().toLowerCase();
}

const desabilitados = new Set(
  (process.env.NEXT_PUBLIC_MODULOS_DESABILITADOS ?? "")
    .split(",")
    .map(normalizar)
    .filter(Boolean),
);

export function moduloDesabilitado(nome: string): boolean {
  return desabilitados.has(normalizar(nome));
}
