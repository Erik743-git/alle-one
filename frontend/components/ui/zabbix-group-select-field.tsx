"use client";

import * as React from "react";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { companiesService } from "@/lib/services/companies.service";

type ZabbixGroupOption = {
  groupid: string;
  name: string;
};

type ZabbixGroupValidation = {
  exists: boolean;
  canonicalName?: string | null;
};

type ZabbixGroupSelectFieldProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

const MIN_SEARCH_LEN = 2;
const SEARCH_DEBOUNCE_MS = 280;

export function ZabbixGroupSelectField({
  value,
  onChange,
  disabled = false,
  placeholder = "Digite para buscar no Zabbix (ex.: GRP_TUPER)",
  className,
}: ZabbixGroupSelectFieldProps) {
  const [draft, setDraft] = React.useState(value);
  const [focused, setFocused] = React.useState(false);
  const [results, setResults] = React.useState<ZabbixGroupOption[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState("");
  const [validation, setValidation] = React.useState<ZabbixGroupValidation | null>(
    null,
  );
  const [validating, setValidating] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setDraft(value);
  }, [value]);

  React.useEffect(() => {
    const trimmed = value.trim();
    if (!trimmed) {
      setValidation(null);
      return;
    }

    let cancelled = false;
    setValidating(true);

    void (async () => {
      try {
        const result = await companiesService.validateZabbixGroup(trimmed);
        if (!cancelled) {
          setValidation({
            exists: result.exists,
            canonicalName: result.canonicalName,
          });
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
  }, [value]);

  React.useEffect(() => {
    if (!focused) {
      return;
    }

    const query = draft.trim();
    if (query.length < MIN_SEARCH_LEN) {
      setResults([]);
      setSearchError("");
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const data = await companiesService.searchZabbixGroups(query);
          if (!cancelled) {
            setResults(data);
            setSearchError("");
          }
        } catch (error) {
          if (!cancelled) {
            setResults([]);
            setSearchError(
              error instanceof Error
                ? error.message
                : "Não foi possível buscar no Zabbix. Verifique ZABBIX_URL e ZABBIX_TOKEN no servidor.",
            );
          }
        } finally {
          if (!cancelled) {
            setSearching(false);
          }
        }
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [draft, focused]);

  React.useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setFocused(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const showDropdown = focused && draft.trim().length >= MIN_SEARCH_LEN;
  const showUnknownWarning =
    Boolean(value.trim()) &&
    !validating &&
    validation?.exists === false;

  function commitDraft(next?: string) {
    const trimmed = (next ?? draft).trim();
    onChange(trimmed);
    setDraft(trimmed);
    setFocused(false);
  }

  function pickGroup(name: string) {
    onChange(name);
    setDraft(name);
    setFocused(false);
  }

  return (
    <div ref={rootRef} className={cn("relative space-y-2", className)}>
      <div className="relative">
        <Input
          value={draft}
          disabled={disabled}
          placeholder={placeholder}
          className={cn(
            "h-11 pr-20 font-sans",
            showUnknownWarning && "border-amber-500/50",
          )}
          onFocus={() => setFocused(true)}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitDraft();
            }
            if (event.key === "Escape") {
              setDraft(value);
              setFocused(false);
            }
          }}
          onBlur={() => {
            window.setTimeout(() => {
              if (!rootRef.current?.contains(document.activeElement)) {
                if (draft.trim() !== value.trim()) {
                  commitDraft();
                }
                setFocused(false);
              }
            }, 120);
          }}
        />

        <div className="absolute inset-y-0 right-1 flex items-center gap-1">
          {searching || validating ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : null}
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground"
              disabled={disabled}
              onClick={() => {
                onChange("");
                setDraft("");
                setResults([]);
              }}
              title="Limpar grupo"
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>

      {showDropdown ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
          {searchError ? (
            <p className="border-b border-border px-3 py-2 text-xs text-amber-400">
              {searchError}
            </p>
          ) : null}

          <ul className="max-h-56 overflow-y-auto overscroll-contain" role="listbox">
            {searching ? (
              <li className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Buscando no Zabbix...
              </li>
            ) : results.length === 0 ? (
              <li className="px-3 py-3 text-sm text-muted-foreground">
                Nenhum grupo encontrado. Confira o nome exato no Zabbix.
              </li>
            ) : (
              results.map((group) => {
                const selected =
                  group.name.toLowerCase() === value.trim().toLowerCase();
                return (
                  <li key={group.groupid}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted",
                        selected && "bg-primary/10 font-medium",
                      )}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => pickGroup(group.name)}
                    >
                      {selected ? (
                        <Check className="size-4 shrink-0 text-primary" />
                      ) : (
                        <span className="size-4 shrink-0" />
                      )}
                      <span className="truncate font-mono">{group.name}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          {draft.trim() &&
          !results.some(
            (group) => group.name.toLowerCase() === draft.trim().toLowerCase(),
          ) ? (
            <div className="border-t border-border p-2">
              <Button
                type="button"
                variant="secondary"
                className="h-9 w-full justify-start font-sans text-sm"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => commitDraft()}
              >
                Usar &quot;{draft.trim()}&quot;
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {!focused && draft.trim().length > 0 && draft.trim().length < MIN_SEARCH_LEN ? (
        <p className="text-xs text-muted-foreground">
          Digite pelo menos {MIN_SEARCH_LEN} caracteres para buscar no Zabbix.
        </p>
      ) : null}

      {showUnknownWarning ? (
        <p className="flex items-start gap-2 text-xs text-amber-400">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          Este grupo não existe no Zabbix. Busque pelo nome correto (ex. GRP_TUPER).
        </p>
      ) : null}

      {validation?.exists && validation.canonicalName && validation.canonicalName !== value ? (
        <p className="text-xs text-muted-foreground">
          Nome no Zabbix:{" "}
          <button
            type="button"
            className="font-medium text-primary underline-offset-2 hover:underline"
            onClick={() => pickGroup(validation.canonicalName!)}
          >
            {validation.canonicalName}
          </button>
        </p>
      ) : null}

      {validation?.exists ? (
        <p className="flex items-center gap-1.5 text-xs text-emerald-500/90">
          <Check className="size-3.5" />
          Grupo confirmado no Zabbix
        </p>
      ) : null}
    </div>
  );
}
