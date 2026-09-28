import { describe, expect, it } from "vitest";
import {
  mostradosAPartirDeOcultos,
  mostrarTipo,
  ocultosDoFiltroAntigo,
} from "./mailbox-filters";
import { ALL_MAILBOX_KINDS } from "./services/mailbox.service";

describe("filtro de tipos do Correio", () => {
  it("quem salvou filtro no formato antigo passa a ver os tipos novos", () => {
    // Filtro antigo: mostrava só GMUD e inventário (desmarcou o resto).
    const ocultos = ocultosDoFiltroAntigo(["GMUD_PENDING_APPROVAL", "INVENTORY_EXPIRY"]);
    const mostrados = mostradosAPartirDeOcultos(ocultos);

    // Continua escondido o que a pessoa desmarcou...
    expect(mostrados).not.toContain("RENDIMENTO_ALERT");
    // ...continua visível o que ela tinha marcado...
    expect(mostrados).toContain("GMUD_PENDING_APPROVAL");
    // ...e os tipos que nem existiam na época aparecem.
    expect(mostrados).toContain("TICKET_NOVO_RESPONSAVEL");
    expect(mostrados).toContain("MURAL_NOTE_RECEIVED");
  });

  it("os avisos de chamado estão na lista da tela (antes ficavam escondidos)", () => {
    expect(ALL_MAILBOX_KINDS).toContain("TICKET_ABERTO_PARA_VOCE");
    expect(ALL_MAILBOX_KINDS).toContain("TICKET_NOVO_RESPONSAVEL");
  });

  it("tipo que a tela ainda não conhece aparece, em vez de sumir", () => {
    expect(mostrarTipo("TIPO_FUTURO" as never, [])).toBe(true);
  });

  it("tipo conhecido obedece ao filtro", () => {
    expect(mostrarTipo("GMUD_PENDING_APPROVAL", [])).toBe(false);
    expect(mostrarTipo("GMUD_PENDING_APPROVAL", ["GMUD_PENDING_APPROVAL"])).toBe(true);
  });

  it("esconder tudo volta a mostrar tudo", () => {
    expect(mostradosAPartirDeOcultos([...ALL_MAILBOX_KINDS])).toEqual(ALL_MAILBOX_KINDS);
  });
});
