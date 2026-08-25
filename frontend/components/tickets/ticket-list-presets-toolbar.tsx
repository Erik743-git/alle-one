"use client";

import { useMemo, useState } from "react";
import {
  ExternalLink,
  Filter,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { notifyError, notifySuccess } from "@/lib/notify";
import type { TicketListPreset } from "@/lib/tickets/list-presets";
import { ticketListPresetsService } from "@/lib/services/ticket-list-presets.service";
import { cn } from "@/lib/utils";
import { isAdmin } from "@/lib/access-control";

type Props = {
  presets: TicketListPreset[];
  activePresetId: string | null;
  onRefresh: () => void;
  onApply: (preset: TicketListPreset) => void;
  onCreate: () => void;
  onEdit: (preset: TicketListPreset) => void;
};

function canManagePreset(preset: TicketListPreset) {
  return preset.isOwner || isAdmin();
}

function PresetPill({
  preset,
  active,
  onClick,
  onEdit,
  onTogglePin,
  onRemove,
}: {
  preset: TicketListPreset;
  active: boolean;
  onClick: () => void;
  onEdit: () => void;
  onTogglePin: () => void;
  onRemove: () => void;
}) {
  const manageable = canManagePreset(preset);

  return (
    <div className="inline-flex max-w-[240px] items-center">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex h-9 min-w-0 flex-1 items-center gap-2 rounded-l-full border border-r-0 px-3 text-sm font-medium text-white shadow-sm transition hover:brightness-110",
          !manageable && "rounded-r-full border-r",
          active && "ring-2 ring-white/50 ring-offset-2 ring-offset-background",
        )}
        style={{ backgroundColor: preset.color, borderColor: preset.color }}
        title={preset.isPublic ? "Filtro público" : preset.name}
      >
        <span className="truncate">{preset.name}</span>
        {preset.isPublic ? (
          <ExternalLink className="size-3.5 shrink-0 opacity-80" aria-hidden />
        ) : null}
      </button>
      {manageable ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex h-9 shrink-0 items-center justify-center rounded-r-full border px-2 text-white transition hover:brightness-110",
                active && "ring-2 ring-white/50 ring-offset-2 ring-offset-background",
              )}
              style={{ backgroundColor: preset.color, borderColor: preset.color }}
              title="Opções do filtro"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="mr-2 size-3.5" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onTogglePin}>
              <PinOff className="mr-2 size-3.5" />
              Desafixar
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={onRemove}
            >
              <Trash2 className="mr-2 size-3.5" />
              Remover
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

export function TicketListPresetsToolbar({
  presets,
  activePresetId,
  onRefresh,
  onApply,
  onCreate,
  onEdit,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const pinned = useMemo(
    () =>
      presets
        .filter((p) => p.isPinned)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [presets],
  );

  const created = useMemo(() => {
    const term = q.trim().toLocaleLowerCase("pt-BR");
    return presets.filter((p) => {
      if (!term) return true;
      return p.name.toLocaleLowerCase("pt-BR").includes(term);
    });
  }, [presets, q]);

  async function togglePin(preset: TicketListPreset) {
    try {
      await ticketListPresetsService.update(preset.id, {
        isPinned: !preset.isPinned,
      });
      notifySuccess(preset.isPinned ? "Filtro desafixado." : "Filtro fixado na tela.");
      onRefresh();
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível fixar o filtro.",
      );
    }
  }

  async function removePreset(preset: TicketListPreset) {
    if (!window.confirm(`Remover o filtro "${preset.name}"?`)) return;
    try {
      await ticketListPresetsService.remove(preset.id);
      notifySuccess("Filtro removido.");
      onRefresh();
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível remover o filtro.",
      );
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            className="h-9 gap-2 bg-teal-600 text-white hover:bg-teal-500"
          >
            <Filter className="size-4" />
            Filtros
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-80 space-y-2 p-3 font-sans"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Criados
          </p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar filtro"
              className="h-9 pl-8 text-sm"
            />
          </div>
          <div className="max-h-56 space-y-1 overflow-y-auto">
            {created.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Nenhum filtro salvo
              </p>
            ) : (
              created.map((preset) => (
                <div
                  key={preset.id}
                  className="flex items-center gap-1 rounded-md px-1 py-1 hover:bg-muted/50"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-sm font-medium"
                    onClick={() => {
                      onApply(preset);
                      setOpen(false);
                    }}
                  >
                    <span
                      className="mr-2 inline-block size-2.5 rounded-full"
                      style={{ backgroundColor: preset.color }}
                    />
                    {preset.name}
                    {preset.isPublic ? (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        (público)
                      </span>
                    ) : null}
                  </button>
                  {canManagePreset(preset) ? (
                    <>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        title="Editar"
                        onClick={() => {
                          onEdit(preset);
                          setOpen(false);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        title={preset.isPinned ? "Desafixar" : "Fixar na tela"}
                        onClick={() => void togglePin(preset)}
                      >
                        {preset.isPinned ? (
                          <PinOff className="size-3.5" />
                        ) : (
                          <Pin className="size-3.5" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive"
                        title="Remover"
                        onClick={() => void removePreset(preset)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </>
                  ) : null}
                </div>
              ))
            )}
          </div>
          <Button
            type="button"
            className="h-10 w-full gap-2 bg-teal-600 text-white hover:bg-teal-500"
            onClick={() => {
              onCreate();
              setOpen(false);
            }}
          >
            <Plus className="size-4" />
            Criar filtro
          </Button>
        </DropdownMenuContent>
      </DropdownMenu>

      {pinned.map((preset) => (
        <PresetPill
          key={preset.id}
          preset={preset}
          active={activePresetId === preset.id}
          onClick={() => onApply(preset)}
          onEdit={() => onEdit(preset)}
          onTogglePin={() => void togglePin(preset)}
          onRemove={() => void removePreset(preset)}
        />
      ))}
    </div>
  );
}
