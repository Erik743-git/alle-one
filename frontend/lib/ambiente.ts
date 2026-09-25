/**
 * Em que ambiente o portal está rodando, para a tarja de teste.
 *
 * `NEXT_PUBLIC_AMBIENTE` (build) manda quando definida: "producao" esconde a
 * tarja, qualquer outro valor mostra. Sem a variável, o endereço decide: host
 * com "teste", "test", "homolog" ou "staging" como parte do nome é teste.
 * Produção nunca tem esses nomes, então o padrão é não mostrar.
 */
const HOST_DE_TESTE =
  /(^|[.-])(teste|test|homolog|homologacao|staging|sandbox)([.-]|$)/i;

export function ehAmbienteDeTeste(
  variavel: string | undefined = process.env.NEXT_PUBLIC_AMBIENTE,
  host: string | undefined = typeof window !== "undefined"
    ? window.location.hostname
    : undefined,
): boolean {
  const v = variavel?.trim().toLowerCase();
  if (v) return v !== "producao" && v !== "production" && v !== "prod";
  return !!host && HOST_DE_TESTE.test(host);
}
