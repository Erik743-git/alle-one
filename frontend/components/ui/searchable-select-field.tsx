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
}: SearchableSelectFieldProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const sortedOptions = React.useMemo(() => {
    if (preserveOrder) return options;
    return [...options].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [options, preserveOrder]);

  const filteredOptions = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return sortedOptions;
    return sortedOptions.filter((item) =>
      item.label.toLowerCase().includes(normalizedQuery),
    );
  }, [query, sortedOptions]);

  const selectedLabel =
    sortedOptions.find((item) => item.value === value)?.label || "";

  const displayLabel =
    selectedLabel || (loading ? "Carregando..." : emptyLabel || placeholder);

  const showSearch = sortedOptions.length > 8;

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
        >
          <span className="truncate">{displayLabel}</span>
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
        className="w-[min(100vw-2rem,var(--radix-popover-trigger-width))] p-2"
      >
        {showSearch ? (
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="mb-2 h-9 font-sans"
            autoFocus
          />
        ) : null}

        <ul
          className="max-h-48 overflow-y-auto overscroll-contain rounded-md border border-border"
          role="listbox"
          onWheelCapture={handleListWheel}
        >
          {emptyLabel ? (
            <li>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                  !value && "bg-muted/60 font-medium",
                )}
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                {!value ? (
                  <Check className="size-4 shrink-0" />
                ) : (
                  <span className="size-4 shrink-0" />
                )}
                <span className="text-muted-foreground">{emptyLabel}</span>
              </button>
            </li>
          ) : null}

          {filteredOptions.length === 0 ? (
            <li className="px-3 py-3 text-sm text-muted-foreground">
              Nenhuma opção encontrada.
            </li>
          ) : (
            filteredOptions.map((item) => {
              const selected = item.value === value;
              return (
                <li key={item.value}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                      selected && "bg-primary/10 font-medium text-foreground",
                    )}
                    onClick={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                  >
                    {selected ? (
                      <Check className="size-4 shrink-0 text-primary" />
                    ) : (
                      <span className="size-4 shrink-0" />
                    )}
                    <span className="truncate">{item.label}</span>
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
