"use client";

import * as React from "react";
import { AlertTriangle, Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ZabbixGroupOption } from "@/lib/services/zabbix.service";

type ZabbixGroupValidation = {
  exists: boolean;
  canonicalName?: string | null;
};

type ZabbixGroupSelectFieldProps = {
  value: string;
  onChange: (value: string) => void;
  groups: ZabbixGroupOption[];
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  loadError?: string;
  onValidate?: (name: string) => Promise<ZabbixGroupValidation>;
};

export function ZabbixGroupSelectField({
  value,
  onChange,
  groups,
  loading = false,
  disabled = false,
  placeholder = "Selecione ou digite um grupo",
  className,
  loadError,
  onValidate,
}: ZabbixGroupSelectFieldProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [validation, setValidation] = React.useState<ZabbixGroupValidation | null>(
    null,
  );
  const [validating, setValidating] = React.useState(false);

  const handleListWheel = React.useCallback(
    (event: React.WheelEvent<HTMLUListElement>) => {
      const element = event.currentTarget;
      if (element.scrollHeight <= element.clientHeight) return;
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

  const trimmedQuery = query.trim();
  const canApplyCustom =
    trimmedQuery.length > 0 &&
    !groups.some(
      (group) => group.name.toLowerCase() === trimmedQuery.toLowerCase(),
    );

  React.useEffect(() => {
    const trimmed = value.trim();
    if (!trimmed || !onValidate) {
      setValidation(null);
      return;
    }

    let cancelled = false;
    setValidating(true);

    void (async () => {
      try {
        const result = await onValidate(trimmed);
        if (!cancelled) {
          setValidation(result);
        }
      } catch {
        if (!cancelled) {
          setValidation(null);
        }
      } finally {
        if (!cancelled) {
          setValidating(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [onValidate, value]);

  const label = value.trim() || (loading ? "Carregando grupos..." : placeholder);
  const inCatalog = groups.some(
    (group) => group.name.toLowerCase() === value.trim().toLowerCase(),
  );
  const showUnknownWarning =
    Boolean(value.trim()) &&
    !loading &&
    !validating &&
    validation?.exists === false &&
    !inCatalog;

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled || loading}
            className={cn(
              "h-11 w-full justify-between px-3 font-normal font-sans",
              !value && "text-muted-foreground",
              showUnknownWarning && "border-amber-500/50",
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
            placeholder="Pesquisar ou digitar grupo..."
            className="mb-2 h-9 font-sans"
            autoFocus
          />

          {loadError ? (
            <p className="mb-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-200">
              {loadError}
            </p>
          ) : null}

          <ul
            className="max-h-56 overflow-y-auto overscroll-contain rounded-md border border-border"
            role="listbox"
            onWheelCapture={handleListWheel}
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
                Nenhum grupo na lista.
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

          {canApplyCustom ? (
            <div className="mt-2 space-y-2 border-t border-border pt-2">
              <p className="text-xs text-muted-foreground">
                Nome digitado não está na lista — use o nome exato do Zabbix:
              </p>
              <Button
                type="button"
                variant="secondary"
                className="h-9 w-full justify-start font-sans text-sm"
                onClick={() => {
                  onChange(trimmedQuery);
                  setOpen(false);
                }}
              >
                Usar &quot;{trimmedQuery}&quot;
              </Button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>

      {showUnknownWarning ? (
        <p className="flex items-start gap-2 text-xs text-amber-400">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          Este grupo não foi encontrado no Zabbix. Confira o nome exato (ex. GRP_TUPER).
        </p>
      ) : null}

      {validation?.exists && validation.canonicalName && validation.canonicalName !== value ? (
        <p className="text-xs text-muted-foreground">
          Nome canônico no Zabbix:{" "}
          <button
            type="button"
            className="font-medium text-primary underline-offset-2 hover:underline"
            onClick={() => onChange(validation.canonicalName!)}
          >
            {validation.canonicalName}
          </button>
        </p>
      ) : null}

      {!loadError && !loading && groups.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {groups.length} grupo(s) disponíveis no Zabbix
        </p>
      ) : null}
    </div>
  );
}
