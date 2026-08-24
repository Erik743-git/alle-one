"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Filter,
  Search,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { FlipCheckbox } from "@/components/ui/flip-checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ExcelSortDir = "asc" | "desc";

export type ExcelColumnFilterState = {
  /** Valores marcados; null = todos. */
  selected: string[] | null;
  query: string;
};

type ExcelColumnHeaderProps = {
  label: string;
  columnKey: string;
  sortKey: string | null;
  sortDir: ExcelSortDir | null;
  onSort: (columnKey: string) => void;
  filter: ExcelColumnFilterState;
  onFilterChange: (next: ExcelColumnFilterState) => void;
  /** Valores distintos da coluna (já normalizados para exibição). */
  distinctValues: string[];
  className?: string;
  align?: "left" | "right" | "center";
};

export function emptyExcelFilter(): ExcelColumnFilterState {
  return { selected: null, query: "" };
}

export function excelFilterActive(filter: ExcelColumnFilterState): boolean {
  return Boolean(
    filter.query.trim() ||
      (filter.selected != null && filter.selected.length > 0),
  );
}

export function countActiveExcelFilters(
  filters: Record<string, ExcelColumnFilterState>,
): number {
  return Object.values(filters).filter(excelFilterActive).length;
}

export function valuePassesExcelFilter(
  raw: string | null | undefined,
  filter: ExcelColumnFilterState,
): boolean {
  const value = (raw ?? "—").trim() || "—";
  const q = filter.query.trim().toLocaleLowerCase("pt-BR");
  if (q && !value.toLocaleLowerCase("pt-BR").includes(q)) return false;
  if (filter.selected != null) {
    if (filter.selected.length === 0) return false;
    return filter.selected.includes(value);
  }
  return true;
}

export function ExcelColumnHeader({
  label,
  columnKey,
  sortKey,
  sortDir,
  onSort,
  filter,
  onFilterChange,
  distinctValues,
  className,
  align = "left",
}: ExcelColumnHeaderProps) {
  const [open, setOpen] = useState(false);
  const active = excelFilterActive(filter);
  const sorted = sortKey === columnKey;

  const visibleValues = useMemo(() => {
    const q = filter.query.trim().toLocaleLowerCase("pt-BR");
    if (!q) return distinctValues;
    return distinctValues.filter((v) =>
      v.toLocaleLowerCase("pt-BR").includes(q),
    );
  }, [distinctValues, filter.query]);

  const selectedCount =
    filter.selected == null ? distinctValues.length : filter.selected.length;

  const allSelected =
    filter.selected == null ||
    (distinctValues.length > 0 &&
      filter.selected.length === distinctValues.length);

  return (
    <th
      className={cn(
        "border-r border-border/50 bg-background p-0 font-sans last:border-r-0",
        className,
      )}
    >
      <div
        className={cn(
          "flex min-h-10 items-stretch",
          align === "right" && "justify-end",
          align === "center" && "justify-center",
        )}
      >
        <button
          type="button"
          className={cn(
            "inline-flex min-w-0 flex-1 items-center gap-1.5 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide transition",
            sorted
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
          )}
          onClick={() => onSort(columnKey)}
          title={
            sorted
              ? sortDir === "asc"
                ? "Ordenado A → Z (clique para Z → A)"
                : "Ordenado Z → A (clique para remover)"
              : "Ordenar coluna"
          }
        >
          <span className="truncate">{label}</span>
          {sorted && sortDir === "asc" ? (
            <ArrowUp className="size-3.5 shrink-0" aria-hidden />
          ) : sorted && sortDir === "desc" ? (
            <ArrowDown className="size-3.5 shrink-0" aria-hidden />
          ) : (
            <ArrowUpDown className="size-3.5 shrink-0 opacity-35" aria-hidden />
          )}
        </button>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "relative inline-flex w-9 shrink-0 items-center justify-center border-l border-border/50 transition",
                active
                  ? "bg-teal-500/15 text-teal-700 dark:text-teal-300"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              )}
              title="Filtrar coluna"
              aria-label={`Filtrar ${label}`}
              onClick={(e) => e.stopPropagation()}
            >
              <Filter className="size-3.5" />
              {active ? (
                <span className="absolute right-1 top-1 size-1.5 rounded-full bg-teal-500" />
              ) : null}
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-72 space-y-3 p-0 font-sans"
            align="start"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-border/60 px-3 py-2.5">
              <p className="text-xs font-semibold text-foreground">{label}</p>
              <p className="text-[11px] text-muted-foreground">
                {selectedCount} de {distinctValues.length} valor(es)
              </p>
            </div>

            <div className="space-y-2 px-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={filter.query}
                  onChange={(e) =>
                    onFilterChange({ ...filter, query: e.target.value })
                  }
                  placeholder="Buscar na lista…"
                  className="h-9 pl-8 text-sm"
                />
              </div>

              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border/50 bg-muted/20 px-2 py-1.5 text-xs font-medium text-foreground">
                <FlipCheckbox
                  checked={allSelected}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onFilterChange({ ...filter, selected: null });
                    } else {
                      onFilterChange({ ...filter, selected: [] });
                    }
                  }}
                />
                Selecionar todos
              </label>
            </div>

            <div className="mx-3 max-h-52 space-y-0.5 overflow-y-auto rounded-md border border-border/60 bg-background/80 p-1">
              {visibleValues.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                  Nenhum valor encontrado
                </p>
              ) : (
                visibleValues.map((value) => {
                  const checked =
                    filter.selected == null || filter.selected.includes(value);
                  return (
                    <label
                      key={value}
                      className={cn(
                        "flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-xs text-foreground transition hover:bg-muted/50",
                        checked && "bg-muted/30",
                      )}
                    >
                      <FlipCheckbox
                        className="mt-0.5 shrink-0"
                        checked={checked}
                        onChange={(e) => {
                          const base =
                            filter.selected == null
                              ? [...distinctValues]
                              : [...filter.selected];
                          if (e.target.checked) {
                            if (!base.includes(value)) base.push(value);
                          } else {
                            const idx = base.indexOf(value);
                            if (idx >= 0) base.splice(idx, 1);
                          }
                          const nextSelected =
                            base.length === distinctValues.length ? null : base;
                          onFilterChange({
                            ...filter,
                            selected: nextSelected,
                          });
                        }}
                      />
                      <span className="min-w-0 break-words leading-snug">
                        {value}
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2.5">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 gap-1 px-2 text-xs"
                onClick={() => onFilterChange(emptyExcelFilter())}
              >
                <X className="size-3.5" />
                Limpar
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 px-4 text-xs"
                onClick={() => setOpen(false)}
              >
                Aplicar
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </th>
  );
}
