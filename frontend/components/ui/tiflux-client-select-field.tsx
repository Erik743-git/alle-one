"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TifluxClient } from "@/lib/services/tiflux.service";

export function getTifluxClientLabel(client: TifluxClient): string {
  return client.name?.trim() || client.social_name?.trim() || `Cliente ${client.id}`;
}

type TifluxClientSelectFieldProps = {
  value: number | null;
  onChange: (clientId: number | null, clientName: string) => void;
  clients: TifluxClient[];
  selectedLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
};

export function TifluxClientSelectField({
  value,
  onChange,
  clients,
  selectedLabel = "",
  loading = false,
  disabled = false,
  placeholder = "Selecione um cliente",
  searchPlaceholder = "Pesquisar cliente...",
  className,
}: TifluxClientSelectFieldProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const handleListWheel = React.useCallback(
    (event: React.WheelEvent<HTMLUListElement>) => {
      const element = event.currentTarget;
      if (element.scrollHeight <= element.clientHeight) return;
      // Em popover dentro de dialog, alguns navegadores bloqueiam scroll por roda.
      event.preventDefault();
      element.scrollTop += event.deltaY;
    },
    [],
  );

  React.useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  const options = React.useMemo(() => {
    const merged = [...clients];

    if (value != null && !merged.some((client) => Number(client.id) === value)) {
      const fallbackName = selectedLabel.trim() || `Cliente ${value}`;
      merged.push({
        id: value,
        name: fallbackName,
      });
    }

    const normalizedQuery = query.trim().toLowerCase();

    return merged
      .filter((client) => {
        const label = getTifluxClientLabel(client);
        if (!label) return false;
        if (!normalizedQuery) return true;
        return label.toLowerCase().includes(normalizedQuery);
      })
      .sort((a, b) =>
        getTifluxClientLabel(a).localeCompare(getTifluxClientLabel(b), "pt-BR"),
      );
  }, [clients, query, selectedLabel, value]);

  const selectedClient = React.useMemo(
    () => clients.find((client) => Number(client.id) === value) ?? null,
    [clients, value],
  );
  const showSearch = options.length > 8;

  const displayLabel =
    (value != null
      ? selectedClient
        ? getTifluxClientLabel(selectedClient)
        : selectedLabel.trim() || `Cliente ${value}`
      : "") || (loading ? "Carregando clientes..." : placeholder);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || loading}
          className={cn(
            "h-11 w-full justify-between px-3 font-normal font-sans",
            value == null && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronDown className="ml-2 size-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
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
          <li>
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                value == null && "bg-muted/60 font-medium",
              )}
              onClick={() => {
                onChange(null, "");
                setOpen(false);
              }}
            >
              {value == null ? (
                <Check className="size-4 shrink-0" />
              ) : (
                <span className="size-4 shrink-0" />
              )}
              <span className="text-muted-foreground">Nenhum</span>
            </button>
          </li>

          {options.length === 0 ? (
            <li className="px-3 py-3 text-sm text-muted-foreground">
              Nenhum cliente encontrado.
            </li>
          ) : (
            options.map((client) => {
              const clientId = Number(client.id);
              const selected = value === clientId;
              const label = getTifluxClientLabel(client);

              return (
                <li key={client.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                      selected && "bg-primary/10 font-medium text-foreground",
                    )}
                    onClick={() => {
                      onChange(clientId, label);
                      setOpen(false);
                    }}
                  >
                    {selected ? (
                      <Check className="size-4 shrink-0 text-primary" />
                    ) : (
                      <span className="size-4 shrink-0" />
                    )}
                    <span className="truncate">{label}</span>
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
