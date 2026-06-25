"use client";

import * as React from "react";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { companiesService } from "@/lib/services/companies.service";
import {
  parseZabbixGroupNames,
  serializeZabbixGroupNames,
} from "@/lib/zabbix-groups";

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

          <ul className="max-h-72 overflow-y-auto overscroll-contain" role="listbox">
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

export function ZabbixGroupMultiSelectField({
  value,
  onChange,
  disabled = false,
  placeholder = "Digite para buscar no Zabbix (ex.: GRP_TUPER)",
  className,
}: ZabbixGroupSelectFieldProps) {
  const groups = React.useMemo(() => parseZabbixGroupNames(value), [value]);
  const [draft, setDraft] = React.useState("");
  const [focused, setFocused] = React.useState(false);
  const [results, setResults] = React.useState<ZabbixGroupOption[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState("");
  const [validations, setValidations] = React.useState<
    Record<string, ZabbixGroupValidation | null>
  >({});
  const [validating, setValidating] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!groups.length) {
      setValidations({});
      return;
    }

    let cancelled = false;
    setValidating(true);

    void (async () => {
      const entries = await Promise.all(
        groups.map(async (group) => {
          try {
            const result = await companiesService.validateZabbixGroup(group);
            return [
              group,
              {
                exists: result.exists,
                canonicalName: result.canonicalName,
              },
            ] as const;
          } catch {
            return [group, null] as const;
          }
        }),
      );

      if (!cancelled) {
        setValidations(Object.fromEntries(entries));
        setValidating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [groups]);

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

  function commitGroups(nextGroups: string[]) {
    onChange(serializeZabbixGroupNames(nextGroups));
  }

  function addGroup(next?: string) {
    const group = (next ?? draft).trim();
    if (!group) return;

    commitGroups([...groups, group]);
    setDraft("");
    setResults([]);
    setFocused(false);
  }

  function removeGroup(groupName: string) {
    commitGroups(
      groups.filter((group) => group.toLowerCase() !== groupName.toLowerCase()),
    );
  }

  const showDropdown = focused && draft.trim().length >= MIN_SEARCH_LEN;
  const unknownGroups = groups.filter(
    (group) => validations[group]?.exists === false,
  );

  return (
    <div ref={rootRef} className={cn("relative space-y-2", className)}>
      <div
        className="flex min-h-11 flex-wrap items-center gap-2 rounded-md border border-input bg-background px-3 py-2 ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !disabled) {
            event.preventDefault();
            inputRef.current?.focus();
            setFocused(true);
          }
        }}
      >
        {groups.map((group) => {
          const validation = validations[group];
          return (
            <span
              key={group}
              className={cn(
                "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                validation?.exists === false
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
                  : "border-primary/20 bg-primary/10 text-primary",
              )}
              title={group}
            >
              <span className="max-w-[220px] truncate font-mono">{group}</span>
              <button
                type="button"
                className="rounded-full text-muted-foreground hover:text-foreground"
                disabled={disabled}
                onClick={() => removeGroup(group)}
                title="Remover grupo"
              >
                <X className="size-3" />
              </button>
            </span>
          );
        })}

        <input
          ref={inputRef}
          value={draft}
          disabled={disabled}
          placeholder={groups.length ? "Adicionar outro grupo..." : placeholder}
          className="h-7 min-w-[220px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
          onFocus={() => setFocused(true)}
          onChange={(event) => {
            setDraft(event.target.value);
            setFocused(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addGroup();
            }
            if (event.key === "Escape") {
              setDraft("");
              setFocused(false);
            }
            if (event.key === "Backspace" && !draft && groups.length) {
              removeGroup(groups[groups.length - 1]);
            }
          }}
          onBlur={() => {
            window.setTimeout(() => {
              if (!rootRef.current?.contains(document.activeElement)) {
                setFocused(false);
              }
            }, 120);
          }}
        />

        {searching || validating ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {showDropdown ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
          {searchError ? (
            <p className="border-b border-border px-3 py-2 text-xs text-amber-400">
              {searchError}
            </p>
          ) : null}

          <ul className="max-h-72 overflow-y-auto overscroll-contain" role="listbox">
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
                const selected = groups.some(
                  (item) => item.toLowerCase() === group.name.toLowerCase(),
                );
                return (
                  <li key={group.groupid}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted",
                        selected && "bg-primary/10 font-medium",
                      )}
                      disabled={selected}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => addGroup(group.name)}
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
                onClick={() => addGroup()}
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

      {unknownGroups.length ? (
        <p className="flex items-start gap-2 text-xs text-amber-400">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {unknownGroups.length === 1
            ? `O grupo ${unknownGroups[0]} não existe no Zabbix.`
            : `${unknownGroups.length} grupos não existem no Zabbix.`}
        </p>
      ) : null}

      {groups.length && !unknownGroups.length ? (
        <p className="flex items-center gap-1.5 text-xs text-emerald-500/90">
          <Check className="size-3.5" />
          {groups.length === 1
            ? "Grupo confirmado no Zabbix"
            : `${groups.length} grupos configurados`}
        </p>
      ) : null}
    </div>
  );
}
