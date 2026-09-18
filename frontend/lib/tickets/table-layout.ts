"use client";

import { useCallback, useState } from "react";

import { TICKET_LIST_COLUMNS, type TicketColumnKey } from "./list-presets";

/**
 * Colunas visíveis e largura da tabela de tickets. Quem persiste é a tela
 * (estado salvo no usuário, ver `ticketsService.saveListState`).
 */
export const TICKET_COLUMN_MIN_WIDTH = 70;
export const TICKET_COLUMN_MAX_WIDTH = 800;

export const TICKET_COLUMN_DEFAULT_WIDTHS: Record<TicketColumnKey, number> = {
  number: 100,
  title: 320,
  client: 190,
  gmud: 110,
  stage: 150,
  responsible: 260,
  created: 150,
  updated: 170,
};

const ALL_KEYS = TICKET_LIST_COLUMNS.map((c) => c.key);
/** Colunas opcionais: só aparecem quando o usuário liga em "Colunas". */
const HIDDEN_BY_DEFAULT: TicketColumnKey[] = ["created"];
export const TICKET_DEFAULT_VISIBLE_COLUMNS = ALL_KEYS.filter(
  (k) => !HIDDEN_BY_DEFAULT.includes(k),
);

export type TicketColumnWidths = Partial<Record<TicketColumnKey, number>>;

function clampWidth(n: number): number {
  return Math.round(
    Math.min(TICKET_COLUMN_MAX_WIDTH, Math.max(TICKET_COLUMN_MIN_WIDTH, n)),
  );
}

/** Mantém a ordem padrão e descarta chaves que não existem mais. */
export function normalizeVisibleColumns(keys: unknown): TicketColumnKey[] {
  if (!Array.isArray(keys)) return TICKET_DEFAULT_VISIBLE_COLUMNS;
  const ordered = ALL_KEYS.filter((k) => keys.includes(k));
  return ordered.length > 0 ? ordered : TICKET_DEFAULT_VISIBLE_COLUMNS;
}

export function normalizeColumnWidths(raw: unknown): TicketColumnWidths {
  const widths: TicketColumnWidths = {};
  if (!raw || typeof raw !== "object") return widths;
  for (const key of ALL_KEYS) {
    const w = (raw as Record<string, unknown>)[key];
    if (typeof w === "number" && Number.isFinite(w)) {
      widths[key] = clampWidth(w);
    }
  }
  return widths;
}

export function useTicketTableLayout() {
  const [visibleColumns, setVisibleState] = useState<TicketColumnKey[]>(
    TICKET_DEFAULT_VISIBLE_COLUMNS,
  );
  const [widths, setWidths] = useState<TicketColumnWidths>({});

  const setVisibleColumns = useCallback((keys: TicketColumnKey[]) => {
    const ordered = ALL_KEYS.filter((k) => keys.includes(k));
    // Nunca deixa a tabela sem colunas.
    if (ordered.length === 0) return;
    setVisibleState(ordered);
  }, []);

  const setColumnWidth = useCallback((key: TicketColumnKey, width: number) => {
    setWidths((prev) => ({ ...prev, [key]: clampWidth(width) }));
  }, []);

  const resetLayout = useCallback(() => {
    setVisibleState(TICKET_DEFAULT_VISIBLE_COLUMNS);
    setWidths({});
  }, []);

  /** Aplica o layout salvo no usuário. */
  const restoreLayout = useCallback(
    (saved: { visibleColumns?: unknown; widths?: unknown }) => {
      setVisibleState(normalizeVisibleColumns(saved.visibleColumns));
      setWidths(normalizeColumnWidths(saved.widths));
    },
    [],
  );

  const widthOf = useCallback(
    (key: TicketColumnKey) => widths[key] ?? TICKET_COLUMN_DEFAULT_WIDTHS[key],
    [widths],
  );

  return {
    visibleColumns,
    setVisibleColumns,
    widths,
    widthOf,
    setColumnWidth,
    resetLayout,
    restoreLayout,
  };
}
