import { describe, expect, it } from "vitest";

import {
  EMPTY_TABS,
  PORTAL_TABS_LIMIT,
  activateTab,
  applyRouteChange,
  closeOtherTabs,
  closeTab,
  defaultTabTitle,
  duplicateTab,
  moveTab,
  parseTabs,
  serializeTabs,
  setTabTitle,
  type PortalTabsState,
} from "./tab-model";

let seq = 0;
const newId = () => `t${++seq}`;

function go(
  state: PortalTabsState,
  href: string,
  entryKey: string | null,
  now = 1,
) {
  return applyRouteChange(state, { href, entryKey, now, newId });
}

function hrefs(state: PortalTabsState) {
  return state.tabs.map((tab) => tab.href);
}

function activeHref(state: PortalTabsState) {
  return state.tabs.find((tab) => tab.id === state.activeId)?.href;
}

describe("applyRouteChange", () => {
  it("cada troca de página abre uma guia nova", () => {
    let s = go(EMPTY_TABS, "/tickets", "k1").state;
    s = go(s, "/tickets/81247", "k2").state;
    s = go(s, "/gmud", "k3").state;
    expect(hrefs(s)).toEqual(["/tickets", "/tickets/81247", "/gmud"]);
    expect(activeHref(s)).toBe("/gmud");
  });

  it("página já aberta é focada em vez de duplicada", () => {
    let s = go(EMPTY_TABS, "/tickets", "k1").state;
    s = go(s, "/tickets/81247", "k2").state;
    s = go(s, "/tickets", "k3").state;
    expect(hrefs(s)).toEqual(["/tickets", "/tickets/81247"]);
    expect(activeHref(s)).toBe("/tickets");
  });

  it("mesmo endereço não muda nada além do uso", () => {
    const s1 = go(EMPTY_TABS, "/dashboard", "k1", 1).state;
    const s2 = go(s1, "/dashboard", "k1", 5).state;
    expect(hrefs(s2)).toEqual(["/dashboard"]);
    expect(s2.tabs[0].lastActiveAt).toBe(5);
  });

  it("redirecionamento (mesma entrada de histórico) transforma a guia atual", () => {
    let s = go(EMPTY_TABS, "/tickets", "k1").state;
    s = go(s, "/tickets/new", "k2").state;
    // criou o chamado: router.replace mantém a chave k2
    s = go(s, "/tickets/81300", "k2").state;
    expect(hrefs(s)).toEqual(["/tickets", "/tickets/81300"]);
    expect(s.tabs[1].title).toBe("#81300");
    expect(activeHref(s)).toBe("/tickets/81300");
  });

  it("redirecionamento para página já aberta fecha a de origem e foca a existente", () => {
    let s = go(EMPTY_TABS, "/projetos/c1/p1", "k1").state;
    s = go(s, "/projetos", "k2").state;
    s = go(s, "/projetos/c1/p1", "k2").state;
    expect(hrefs(s)).toEqual(["/projetos/c1/p1"]);
    expect(activeHref(s)).toBe("/projetos/c1/p1");
  });

  it("mudar só a query atualiza a guia atual", () => {
    let s = go(EMPTY_TABS, "/gmud/1", "k1").state;
    s = go(s, "/gmud/1?mode=edit", "k2").state;
    expect(hrefs(s)).toEqual(["/gmud/1?mode=edit"]);
  });

  it("sem a API de histórico, redirecionamento abre guia nova (comportamento seguro)", () => {
    let s = go(EMPTY_TABS, "/tickets/new", null).state;
    s = go(s, "/tickets/81300", null).state;
    expect(hrefs(s)).toEqual(["/tickets/new", "/tickets/81300"]);
  });

  it(`respeita o limite de ${PORTAL_TABS_LIMIT} fechando a usada há mais tempo`, () => {
    let s = EMPTY_TABS;
    for (let i = 1; i <= PORTAL_TABS_LIMIT; i++) {
      s = go(s, `/tickets/${i}`, `k${i}`, i).state;
    }
    // usa a primeira de novo: a menos usada passa a ser a /tickets/2
    s = go(s, "/tickets/1", "kx", 50).state;
    const r = go(s, "/tickets/99", "ky", 60);
    expect(r.state.tabs).toHaveLength(PORTAL_TABS_LIMIT);
    expect(r.evicted.map((tab) => tab.href)).toEqual(["/tickets/2"]);
    expect(hrefs(r.state)).toContain("/tickets/1");
    expect(activeHref(r.state)).toBe("/tickets/99");
  });
});

describe("ações da barra", () => {
  function tres() {
    let s = go(EMPTY_TABS, "/a", "k1").state;
    s = go(s, "/b", "k2").state;
    s = go(s, "/c", "k3").state;
    return s;
  }

  it("fechar a ativa passa para a da direita, ou a da esquerda na ponta", () => {
    let s = tres();
    s = activateTab(s, s.tabs[1].id, 9);
    const meio = closeTab(s, s.tabs[1].id, 10);
    expect(activeHref(meio)).toBe("/c");
    const t = tres();
    const ponta = closeTab(t, t.tabs[2].id, 10);
    expect(hrefs(ponta)).toEqual(["/a", "/b"]);
    expect(activeHref(ponta)).toBe("/b");
  });

  it("fechar uma inativa mantém a ativa", () => {
    const s = tres();
    const r = closeTab(s, s.tabs[0].id, 10);
    expect(hrefs(r)).toEqual(["/b", "/c"]);
    expect(activeHref(r)).toBe("/c");
  });

  it("fechar a última deixa sem guia ativa", () => {
    const s = go(EMPTY_TABS, "/a", "k1").state;
    expect(closeTab(s, s.tabs[0].id, 2)).toEqual({ tabs: [], activeId: null });
  });

  it("fechar as outras deixa só a escolhida, ativa", () => {
    const s = tres();
    const r = closeOtherTabs(s, s.tabs[0].id, 10);
    expect(hrefs(r)).toEqual(["/a"]);
    expect(activeHref(r)).toBe("/a");
  });

  it("duplicar cria a cópia à direita e ativa", () => {
    const s = tres();
    const r = duplicateTab(s, s.tabs[0].id, "copia", 10).state;
    expect(hrefs(r)).toEqual(["/a", "/a", "/b", "/c"]);
    expect(r.activeId).toBe("copia");
    // navegar para /a com a cópia ativa não cria nem troca de guia
    const depois = go(r, "/a", "k9").state;
    expect(depois.activeId).toBe("copia");
    expect(depois.tabs).toHaveLength(4);
  });

  it("título da página substitui o padrão", () => {
    let s = go(EMPTY_TABS, "/tickets/81247", "k1").state;
    expect(s.tabs[0].title).toBe("#81247");
    s = setTabTitle(s, s.tabs[0].id, "  #81247 - Planalto   Validação ");
    expect(s.tabs[0].title).toBe("#81247 - Planalto Validação");
    expect(setTabTitle(s, s.tabs[0].id, "   ")).toBe(s);
  });
});

describe("títulos padrão", () => {
  it.each([
    ["/dashboard", "Dashboard"],
    ["/tickets/new", "Novo ticket"],
    ["/tickets/81247", "#81247"],
    ["/tickets/81247/edit", "Editar #81247"],
    ["/tickets/pre-tickets/abc", "Pré-ticket"],
    ["/admin/email", "E-mail"],
    ["/gmud/xyz?mode=edit", "GMUD"],
    ["/projetos/c1/p1", "Projeto"],
    ["/algo-novo", "Algo-novo"],
  ])("%s → %s", (href, title) => {
    expect(defaultTabTitle(href)).toBe(title);
  });
});

describe("persistência", () => {
  it("ida e volta preserva as guias e a ativa", () => {
    let s = go(EMPTY_TABS, "/a", "k1").state;
    s = go(s, "/b", "k2").state;
    const lido = parseTabs(serializeTabs(s));
    expect(hrefs(lido)).toEqual(["/a", "/b"]);
    expect(lido.activeId).toBe(s.activeId);
    expect(lido.tabs.every((tab) => tab.entryKey === null)).toBe(true);
  });

  it("depois de recarregar as guias voltam adormecidas e acordam ao ativar", () => {
    let s = go(EMPTY_TABS, "/a", "k1").state;
    s = go(s, "/b", "k2").state;
    expect(s.tabs.every((tab) => tab.live)).toBe(true);
    const lido = parseTabs(serializeTabs(s));
    expect(lido.tabs.some((tab) => tab.live)).toBe(false);
    const ativa = activateTab(lido, lido.tabs[0].id, 9);
    expect(ativa.tabs.map((tab) => Boolean(tab.live))).toEqual([true, false]);
    // voltar para a URL de uma guia adormecida também acorda
    const acordou = go(lido, "/b", "k3").state;
    expect(acordou.tabs.find((tab) => tab.href === "/b")?.live).toBe(true);
  });

  it("descarta lixo e endereços externos", () => {
    expect(parseTabs("não é json")).toEqual(EMPTY_TABS);
    expect(parseTabs(JSON.stringify({ v: 2, tabs: [] }))).toEqual(EMPTY_TABS);
    const lido = parseTabs(
      JSON.stringify({
        v: 1,
        activeId: "x",
        tabs: [
          { id: "1", href: "https://outro.site", title: "x" },
          { id: "2", href: "//outro.site", title: "x" },
          { id: "3", href: "/tickets", title: "" },
        ],
      }),
    );
    expect(hrefs(lido)).toEqual(["/tickets"]);
    expect(lido.tabs[0].title).toBe("Tickets");
    expect(lido.activeId).toBe("3");
  });
});

describe("moveTab", () => {
  function tresGuias() {
    let state = go(EMPTY_TABS, "/a", null).state;
    state = go(state, "/b", null).state;
    state = go(state, "/c", null).state;
    return state;
  }

  it("leva a primeira guia para o fim", () => {
    const state = tresGuias();
    const id = state.tabs[0].id;
    expect(hrefs(moveTab(state, id, 2))).toEqual(["/b", "/c", "/a"]);
  });

  it("leva a ultima guia para o comeco", () => {
    const state = tresGuias();
    const id = state.tabs[2].id;
    expect(hrefs(moveTab(state, id, 0))).toEqual(["/c", "/a", "/b"]);
  });

  it("prende o indice nas pontas em vez de ignorar", () => {
    const state = tresGuias();
    const id = state.tabs[0].id;
    expect(hrefs(moveTab(state, id, 99))).toEqual(["/b", "/c", "/a"]);
    expect(hrefs(moveTab(state, id, -5))).toEqual(["/a", "/b", "/c"]);
  });

  it("nao muda a guia ativa nem inventa guia", () => {
    const state = tresGuias();
    const movida = moveTab(state, state.tabs[0].id, 2);
    expect(movida.activeId).toBe(state.activeId);
    expect(movida.tabs).toHaveLength(3);
  });

  it("ignora id que nao existe", () => {
    const state = tresGuias();
    expect(moveTab(state, "nao-existe", 0)).toBe(state);
  });
});
