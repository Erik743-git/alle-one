/**
 * Converte o HTML de um e-mail em texto legível.
 *
 * Os conversores anteriores trocavam `\s+` por um espaço só, então o e-mail
 * inteiro virava um parágrafo corrido: lista numerada, marcadores e parágrafos
 * se fundiam numa linha só. Aqui as quebras estruturais viram quebra de linha
 * *antes* de as tags sumirem, e só o espaço horizontal é colapsado.
 */
/** Entidades nomeadas que aparecem em e-mail em português. */
const ENTIDADES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  hellip: '…',
  ndash: '–',
  mdash: '—',
  bull: '•',
  middot: '·',
  laquo: '«',
  raquo: '»',
  deg: '°',
  ordm: 'º',
  ordf: 'ª',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  euro: '€',
  aacute: 'á',
  agrave: 'à',
  acirc: 'â',
  atilde: 'ã',
  auml: 'ä',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  euml: 'ë',
  iacute: 'í',
  igrave: 'ì',
  icirc: 'î',
  iuml: 'ï',
  oacute: 'ó',
  ograve: 'ò',
  ocirc: 'ô',
  otilde: 'õ',
  ouml: 'ö',
  uacute: 'ú',
  ugrave: 'ù',
  ucirc: 'û',
  uuml: 'ü',
  ccedil: 'ç',
  ntilde: 'ñ',
};

/**
 * Entidade numérica (`&#233;`, `&#xE9;`) ou nomeada. Só o caixa da primeira
 * letra separa `&Aacute;` de `&aacute;`, então basta olhar para ele.
 */
function decodificarEntidades(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (inteiro, nome: string) => {
    if (nome.startsWith('#')) {
      const hex = nome[1]?.toLowerCase() === 'x';
      const num = Number.parseInt(hex ? nome.slice(2) : nome.slice(1), hex ? 16 : 10);
      if (!Number.isFinite(num) || num <= 0 || num > 0x10ffff) return inteiro;
      return String.fromCodePoint(num);
    }
    const base = ENTIDADES[nome.toLowerCase()];
    if (!base) return inteiro;
    return nome[0] === nome[0]?.toUpperCase() ? base.toUpperCase() : base;
  });
}

export function htmlParaTexto(html: string | null | undefined): string {
  if (!html?.trim()) return '';
  return (
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
      // Quebras estruturais viram \n enquanto ainda dá para reconhecê-las.
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|h[1-6]|blockquote)\s*>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n• ')
      .replace(/<\/(ul|ol|table)\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      // Depois de as tags saírem: senão um &lt;script&gt; decodificado
      // viraria tag de verdade e escaparia da limpeza acima.
      .replace(/&[#a-z0-9]+;/gi, (e) => decodificarEntidades(e))
      // Espaço horizontal colapsa; a quebra de linha sobrevive.
      .replace(/[^\S\n]+/g, ' ')
      .replace(/[ \t]*\n[ \t]*/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, 20_000)
  );
}
