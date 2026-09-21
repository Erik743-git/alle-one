/**
 * Casamento do nome do apontamento (vindo do Tiflux) com o cadastro do
 * portal, para descobrir a equipe/mesa do atendente.
 *
 * Casos reais encontrados em produção (21/09): três atendentes caíam em
 * "Sem equipe" porque o nome gravado no apontamento não era idêntico ao
 * do cadastro, e com isso a mesa deles sumia da distribuição de horas.
 */
function normalizeNameKey(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

const SUFIXOS_NOME = new Set(['junior', 'jr', 'filho', 'neto', 'sobrinho']);

function coreNameKey(value: string | null | undefined): string | null {
  const palavras = normalizeNameKey(value)
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((p) => !SUFIXOS_NOME.has(p));
  if (palavras.length === 0) return null;
  return `${palavras[0]}|${palavras[palavras.length - 1]}`;
}

/** Espelha o que o relatório faz: nome completo primeiro, núcleo depois. */
function montarEquipes(cadastro: Array<{ name: string; mesa: string }>) {
  const porNomeCompleto = new Map<string, string>();
  const porNucleo = new Map<string, string | null>();
  for (const u of cadastro) {
    const key = normalizeNameKey(u.name);
    if (key) porNomeCompleto.set(key, u.mesa);
    const coreKey = coreNameKey(u.name);
    if (coreKey) {
      porNucleo.set(coreKey, porNucleo.has(coreKey) ? null : u.mesa);
    }
  }
  return (atendente: string) => {
    const coreKey = coreNameKey(atendente);
    return (
      porNomeCompleto.get(normalizeNameKey(atendente)) ??
      (coreKey ? (porNucleo.get(coreKey) ?? null) : null) ??
      'Sem equipe'
    );
  };
}

describe('equipe do atendente no relatório de horas', () => {
  const equipeDe = montarEquipes([
    { name: 'Andressa Morona Dias Cota', mesa: 'Sistemas' },
    { name: 'Wilson Batini', mesa: 'Infraestrutura' },
    { name: 'Erik Manarin', mesa: 'Sistemas' },
  ]);

  it('casa quando o apontamento omite nomes do meio', () => {
    expect(equipeDe('Andressa Cota')).toBe('Sistemas');
    expect(equipeDe('Erik Bramoski Manarin')).toBe('Sistemas');
  });

  it('casa quando um dos lados tem sufixo Junior', () => {
    expect(equipeDe('Wilson Batini Junior')).toBe('Infraestrutura');
  });

  it('continua casando o nome idêntico', () => {
    expect(equipeDe('Erik Manarin')).toBe('Sistemas');
    expect(equipeDe('ANDRESSA MORONA DIAS COTA')).toBe('Sistemas');
  });

  it('quem não está no cadastro segue em "Sem equipe"', () => {
    expect(equipeDe('Fulano de Tal')).toBe('Sem equipe');
  });

  it('não chuta quando duas pessoas têm o mesmo primeiro e último nome', () => {
    const ambiguo = montarEquipes([
      { name: 'Joao Pedro Silva', mesa: 'NOC' },
      { name: 'Joao Carlos Silva', mesa: 'Projetos' },
    ]);
    expect(ambiguo('Joao Silva')).toBe('Sem equipe');
    // O nome completo continua resolvendo sem ambiguidade.
    expect(ambiguo('Joao Pedro Silva')).toBe('NOC');
  });
});
