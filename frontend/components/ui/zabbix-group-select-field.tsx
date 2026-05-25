"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ZabbixGroupOption } from "@/lib/services/zabbix.service";

type ZabbixGroupSelectFieldProps = {
  value: string;
  onChange: (value: string) => void;
  groups: ZabbixGroupOption[];
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

export function ZabbixGroupSelectField({
  value,
  onChange,
  groups,
  loading = false,
  disabled = false,
  placeholder = "Selecione um grupo",
  className,
}: ZabbixGroupSelectFieldProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  const options = React.useMemo(() => {
    const merged = [...groups];
    const trimmed = value.trim();

    if (trimmed && !merged.some((group) => group.name === trimmed)) {
      merged.push({ groupid: `selected:${trimmed}`, name: trimmed });
    }

    const normalizedQuery = query.trim().toLowerCase();

    return merged
      .filter((group) => {
        const name = group.name?.trim() ?? "";
        if (!name) return false;
        if (!normalizedQuery) return true;
        return name.toLowerCase().includes(normalizedQuery);
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [groups, query, value]);

  const label = value.trim() || (loading ? "Carregando grupos..." : placeholder);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || loading}
          className={cn(
            "h-11 w-full justify-between px-3 font-normal font-sans",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="ml-2 size-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[min(100vw-2rem,var(--radix-popover-trigger-width))] p-2"
      >
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Pesquisar grupo..."
          className="mb-2 h-9 font-sans"
          autoFocus
        />

        <ul
          className="max-h-48 overflow-y-auto overscroll-contain rounded-md border border-border"
          role="listbox"
        >
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
              {!value ? <Check className="size-4 shrink-0" /> : <span className="size-4" />}
              <span className="text-muted-foreground">Nenhum</span>
            </button>
          </li>

          {options.length === 0 ? (
            <li className="px-3 py-3 text-sm text-muted-foreground">
              Nenhum grupo encontrado.
            </li>
          ) : (
            options.map((group) => {
              const selected = group.name === value;
              return (
                <li key={group.groupid}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                      selected && "bg-primary/10 font-medium text-foreground",
                    )}
                    onClick={() => {
                      onChange(group.name);
                      setOpen(false);
                    }}
                  >
                    {selected ? (
                      <Check className="size-4 shrink-0 text-primary" />
                    ) : (
                      <span className="size-4 shrink-0" />
                    )}
                    <span className="truncate">{group.name}</span>
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
