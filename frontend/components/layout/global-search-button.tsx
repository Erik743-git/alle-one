"use client";

import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { openGlobalSearch } from "@/components/layout/global-search";

/**
 * Lupa que abre a busca global.
 *
 * Mesmo desenho do ThemeToggle de propósito: fica ao lado do "Novo ticket" e
 * precisa ler como o mesmo tipo de controle. O Ctrl+K continua valendo — este
 * botão existe para quem não conhece o atalho.
 */
export function GlobalSearchButton({
  collapsed = false,
}: {
  collapsed?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={() => openGlobalSearch()}
      className={
        collapsed
          ? "h-10 w-10 shrink-0 rounded-xl border-border bg-card/60 p-0 text-foreground hover:bg-accent hover:text-accent-foreground xl:h-11 xl:w-11 2xl:h-12 2xl:w-12"
          : "h-9 w-9 shrink-0 rounded-xl border-border bg-card/60 p-0 text-foreground hover:bg-accent hover:text-accent-foreground"
      }
      title="Buscar chamado, pessoa ou empresa (Ctrl+K)"
      aria-label="Buscar chamado, pessoa ou empresa"
    >
      <Search
        className={
          collapsed ? "size-[18px] xl:size-5 2xl:size-[22px]" : "size-4"
        }
      />
    </Button>
  );
}
