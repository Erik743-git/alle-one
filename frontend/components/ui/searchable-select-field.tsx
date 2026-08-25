"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type SelectOption = {
  value: string;
  label: string;
  description?: string;
};

type SearchableSelectFieldProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
  searchPlaceholder?: string;
  /** Use dentro de Sheet/Dialog para evitar conflito de foco. */
  modal?: boolean;
  /** Mantém a ordem das opções quando true (ex.: "Todas as empresas" primeiro). */
  preserveOrder?: boolean;
  /** Exibe busca mesmo com poucas opções (listas longas no Console). */
  alwaysShowSearch?: boolean;
  /** Largura mínima do painel aberto (útil para nomes longos de grupos Zabbix). */
  popoverMinWidth?: string;
};

export function SearchableSelectField({
  value,
  onChange,
  options,
  loading = false,
  disabled = false,
  placeholder = "Selecione",
  emptyLabel = "",
  className,
  searchPlaceholder = "Pesquisar...",
  modal = false,
  preserveOrder = false,
  alwaysShowSearch = false,
  popoverMinWidth,
}: SearchableSelectFieldProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);
  const listRef = React.useRef<HTMLUListElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setHighlightedIndex(-1);
    }
  }, [open]);

  const sortedOptions = React.useMemo(() => {
    if (preserveOrder) return options;
    return [...options].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [options, preserveOrder]);

  const filteredOptions = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return sortedOptions;
    return sortedOptions.filter(
      (item) =>
        item.label.toLowerCase().includes(normalizedQuery) ||
        item.description?.toLowerCase().includes(normalizedQuery) ||
        item.value.toLowerCase().includes(normalizedQuery),
    );
  }, [query, sortedOptions]);

  const selectedLabel =
    sortedOptions.find((item) => item.value === value)?.label || "";

  const displayLabel =
    selectedLabel || (loading ? "Carregando..." : emptyLabel || placeholder);

  const showSearch = alwaysShowSearch || sortedOptions.length > 8;

  const listOptions = React.useMemo(() => {
    const items = filteredOptions.map((item) => ({
      value: item.value,
      label: item.label,
      description: item.description,
      isEmptyOption: false,
    }));
    if (emptyLabel) {
      items.unshift({
        value: "",
        label: emptyLabel,
        description: undefined,
        isEmptyOption: true,
      });
    }
    return items;
  }, [filteredOptions, emptyLabel]);

  React.useEffect(() => {
    if (!open || highlightedIndex < 0) return;
    const element = listRef.current?.children[highlightedIndex] as
      | HTMLElement
      | undefined;
    element?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex, open, listOptions.length]);

  const selectOption = React.useCallback(
    (nextValue: string) => {
      onChange(nextValue);
      setOpen(false);
    },
    [onChange],
  );

  const moveHighlight = React.useCallback(
    (delta: number) => {
      if (listOptions.length === 0) return;
      setHighlightedIndex((current) => {
        const start =
          current < 0
            ? delta > 0
              ? -1
              : listOptions.length
            : current;
        const next = start + delta;
        if (next < 0) return listOptions.length - 1;
        if (next >= listOptions.length) return 0;
        return next;
      });
    },
    [listOptions.length],
  );

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || loading) return;
    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowUp" ||
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      if (!open) {
        const selectedIndex = listOptions.findIndex((item) => item.value === value);
        setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
        setOpen(true);
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        moveHighlight(event.key === "ArrowDown" ? 1 : -1);
      }
      if (event.key === "Enter" || event.key === " ") {
        const item =
          highlightedIndex >= 0
            ? listOptions[highlightedIndex]
            : listOptions.find((entry) => entry.value === value);
        if (item) selectOption(item.value);
      }
    }
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveHighlight(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(-1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item =
        highlightedIndex >= 0
          ? listOptions[highlightedIndex]
          : listOptions[0];
      if (item) selectOption(item.value);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  };

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveHighlight(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(-1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = listOptions[highlightedIndex];
      if (item) selectOption(item.value);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  };

  React.useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      if (showSearch) {
        searchInputRef.current?.focus();
        return;
      }
      listRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, showSearch]);

  const handleListWheel = React.useCallback(
    (event: React.WheelEvent<HTMLUListElement>) => {
      const element = event.currentTarget;
      if (element.scrollHeight <= element.clientHeight) return;
      event.preventDefault();
      element.scrollTop += event.deltaY;
    },
    [],
  );

  return (
    <Popover open={open} onOpenChange={setOpen} modal={modal}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || loading}
          className={cn(
            "h-11 w-full justify-between px-3 font-normal font-sans",
            !selectedLabel && "text-muted-foreground",
            className,
          )}
          title={selectedLabel || undefined}
          onKeyDown={handleTriggerKeyDown}
        >
          <span className="min-w-0 flex-1 truncate text-left">{displayLabel}</span>
          <ChevronDown className="ml-2 size-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={8}
        collisionPadding={16}
        collisionBoundary={
          typeof document !== "undefined" ? [document.documentElement] : undefined
        }
        className={cn(
          "p-2",
          popoverMinWidth ??
            "w-[min(100vw-2rem,var(--radix-popover-trigger-width))]",
        )}
      >
        {showSearch ? (
          <Input
            ref={searchInputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setHighlightedIndex(0);
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder={searchPlaceholder}
            className="mb-2 h-9 font-sans"
            autoFocus
          />
        ) : null}

        <ul
          ref={listRef}
          tabIndex={showSearch ? -1 : 0}
          className="max-h-64 overflow-y-auto overscroll-contain rounded-md border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          role="listbox"
          onWheelCapture={handleListWheel}
          onKeyDown={handleListKeyDown}
        >
          {listOptions.length === 0 ? (
            <li className="px-3 py-3 text-sm text-muted-foreground">
              Nenhuma opção encontrada.
            </li>
          ) : (
            listOptions.map((item, index) => {
              const selected = item.value === value;
              const highlighted = index === highlightedIndex;
              return (
                <li key={item.value || "__empty__"}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                      (selected || highlighted) &&
                        "bg-primary/10 font-medium text-foreground",
                    )}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => {
                      selectOption(item.value);
                    }}
                  >
                    {selected ? (
                      <Check className="size-4 shrink-0 text-primary" />
                    ) : (
                      <span className="size-4 shrink-0" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block break-words text-sm leading-snug",
                          item.isEmptyOption && "text-muted-foreground",
                        )}
                      >
                        {item.label}
                      </span>
                      {item.description ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {item.description}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
