"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  APONTAMENTOS_LIST_SETTINGS_DESCRIPTION,
  APONTAMENTOS_LIST_SETTINGS_LISTED_LABEL,
  APONTAMENTOS_LIST_SETTINGS_TITLE,
} from "@/lib/module-copy";
import { notifyError } from "@/lib/notify";
import { roleDisplayLabel } from "@/lib/app-roles";
import {
  rendimentoService,
  type RendimentoCollaboratorListPreference,
} from "@/lib/services/rendimento.service";
import { ensureArray } from "@/lib/utils";

type ApontamentosCollaboratorListSettingsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPreferencesChange?: (preferences: RendimentoCollaboratorListPreference[]) => void;
};

export function ApontamentosCollaboratorListSettingsSheet({
  open,
  onOpenChange,
  onPreferencesChange,
}: ApontamentosCollaboratorListSettingsSheetProps) {
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<RendimentoCollaboratorListPreference[]>(
    [],
  );

  const loadPreferences = useCallback(async () => {
    setLoading(true);
    try {
      const data = await rendimentoService.listCollaboratorListPreferences();
      const list = ensureArray(data);
      setItems(list);
      onPreferencesChange?.(list);
    } catch (err) {
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar as preferências da lista.",
      );
    } finally {
      setLoading(false);
    }
  }, [onPreferencesChange]);

  useEffect(() => {
    if (!open) return;
    void loadPreferences();
  }, [open, loadPreferences]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => {
      const haystack = [item.name, item.email, item.companyName ?? ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [items, search]);

  async function toggleListed(
    collaboratorId: string,
    listed: boolean,
  ): Promise<void> {
    const previous = items;
    const next = items.map((item) =>
      item.collaboratorId === collaboratorId ? { ...item, listed } : item,
    );
    setItems(next);
    onPreferencesChange?.(next);
    setSavingId(collaboratorId);
    try {
      await rendimentoService.setCollaboratorListPreference({
        collaboratorUserId: collaboratorId,
        listed,
      });
    } catch (err) {
      setItems(previous);
      onPreferencesChange?.(previous);
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível salvar a preferência.",
      );
    } finally {
      setSavingId(null);
    }
  }

  const listedCount = items.filter((item) => item.listed).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl"
      >
        <SheetHeader className="border-b border-border px-6 py-5 text-left">
          <div className="flex items-start gap-3 pr-8">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Settings2 className="size-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <SheetTitle className="text-lg">
                {APONTAMENTOS_LIST_SETTINGS_TITLE}
              </SheetTitle>
              <SheetDescription>
                {APONTAMENTOS_LIST_SETTINGS_DESCRIPTION}
              </SheetDescription>
              {!loading ? (
                <p className="text-xs text-muted-foreground">
                  {listedCount} de {items.length} visíveis na lista
                </p>
              ) : null}
            </div>
          </div>
        </SheetHeader>

        <div className="border-b border-border px-6 py-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nome ou e-mail..."
              className="h-11 pl-9"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhum colaborador encontrado.
            </p>
          ) : (
            <div className="overflow-x-scroll rounded-xl border border-border [scrollbar-gutter:stable]">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Nome</th>
                    <th className="px-4 py-3 font-semibold">E-mail</th>
                    <th className="px-4 py-3 font-semibold">Perfil</th>
                    <th className="px-4 py-3 text-right font-semibold">
                      {APONTAMENTOS_LIST_SETTINGS_LISTED_LABEL}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => {
                    const saving = savingId === item.collaboratorId;
                    return (
                      <tr
                        key={item.collaboratorId}
                        className="border-t border-border hover:bg-muted/20"
                      >
                        <td className="px-4 py-3 font-medium text-foreground">
                          {item.name}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {item.email}
                        </td>
                        <td className="px-4 py-3">
                          {roleDisplayLabel(item.role)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {saving ? (
                              <Loader2 className="size-4 animate-spin text-muted-foreground" />
                            ) : null}
                            <Switch
                              checked={item.listed}
                              disabled={saving}
                              aria-label={`${APONTAMENTOS_LIST_SETTINGS_LISTED_LABEL}: ${item.name}`}
                              onCheckedChange={(listed) =>
                                void toggleListed(item.collaboratorId, listed)
                              }
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="border-t border-border px-6 py-4">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            Fechar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
