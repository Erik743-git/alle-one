"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ContextMenu } from "radix-ui";
import { Copy, Link2, X, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { usePortalTabs } from "./portal-tabs-provider";

const MENU_CONTENT =
  "z-50 min-w-44 overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95";
const MENU_ITEM =
  "relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

/** Avisa o provider a cada troca de endereço (a query também conta). */
function RouteSync() {
  const pathname = usePathname();
  const search = useSearchParams();
  const { syncRoute } = usePortalTabs();
  const query = search.toString();
  const href = query ? `${pathname}?${query}` : pathname;

  useEffect(() => {
    syncRoute(href);
  }, [href, syncRoute]);

  return null;
}

export function PortalTabsBar() {
  const {
    tabs,
    activeId,
    activateTab,
    closeTab,
    closeOtherTabs,
    closeAllTabs,
    duplicateTab,
    copyTabLink,
  } = usePortalTabs();
  const stripRef = useRef<HTMLDivElement>(null);

  // A guia ativa sempre visível, mesmo com a barra rolada.
  useEffect(() => {
    stripRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId, tabs.length]);

  return (
    <>
      <Suspense fallback={null}>
        <RouteSync />
      </Suspense>
      {tabs.length > 0 ? (
        <div className="sticky top-0 z-20 hidden h-11 items-end gap-1 border-b border-border bg-background/95 pl-2 pr-3 backdrop-blur-md md:flex">
          <button
            type="button"
            onClick={closeAllTabs}
            title="Fechar todas as guias"
            aria-label="Fechar todas as guias"
            className="mb-1.5 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" />
          </button>

          <div
            ref={stripRef}
            role="tablist"
            aria-label="Guias abertas"
            className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            onWheel={(event) => {
              // Rodinha vertical rola a barra na horizontal.
              if (event.deltaY !== 0 && event.deltaX === 0) {
                event.currentTarget.scrollLeft += event.deltaY;
              }
            }}
          >
            {tabs.map((tab) => {
              const active = tab.id === activeId;
              return (
                <ContextMenu.Root key={tab.id}>
                  <ContextMenu.Trigger asChild>
                    <div
                      data-active={active ? "true" : undefined}
                      className={cn(
                        "group flex h-9 max-w-[260px] shrink-0 items-center gap-0.5 rounded-t-lg border border-b-0 pl-3 pr-1 text-sm transition-colors",
                        active
                          ? "border-border bg-card font-semibold text-foreground shadow-[inset_0_2px_0_var(--color-primary)]"
                          : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                      )}
                      onMouseDown={(event) => {
                        // Sem isso o botão do meio liga a rolagem automática.
                        if (event.button === 1) event.preventDefault();
                      }}
                      onAuxClick={(event) => {
                        if (event.button === 1) {
                          event.preventDefault();
                          closeTab(tab.id);
                        }
                      }}
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={active}
                        title={tab.title}
                        onClick={() => {
                          if (!active) activateTab(tab.id);
                        }}
                        className="min-w-0 truncate py-1.5 pr-1 text-left focus-visible:outline-none focus-visible:underline"
                      >
                        {tab.title}
                      </button>
                      <button
                        type="button"
                        onClick={() => closeTab(tab.id)}
                        title="Fechar guia"
                        aria-label={`Fechar guia ${tab.title}`}
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-md transition hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active
                            ? "opacity-100"
                            : "opacity-60 group-hover:opacity-100",
                        )}
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  </ContextMenu.Trigger>
                  <ContextMenu.Portal>
                    <ContextMenu.Content className={MENU_CONTENT}>
                      <ContextMenu.Item
                        className={MENU_ITEM}
                        onSelect={() => closeTab(tab.id)}
                      >
                        <X />
                        Fechar
                      </ContextMenu.Item>
                      <ContextMenu.Item
                        className={MENU_ITEM}
                        onSelect={() => duplicateTab(tab.id)}
                      >
                        <Copy />
                        Duplicar
                      </ContextMenu.Item>
                      <ContextMenu.Item
                        className={MENU_ITEM}
                        disabled={tabs.length < 2}
                        onSelect={() => closeOtherTabs(tab.id)}
                      >
                        <XCircle />
                        Fechar as outras
                      </ContextMenu.Item>
                      <ContextMenu.Item
                        className={MENU_ITEM}
                        onSelect={closeAllTabs}
                      >
                        <XCircle />
                        Fechar todas
                      </ContextMenu.Item>
                      <ContextMenu.Separator className="-mx-1 my-1 h-px bg-border" />
                      <ContextMenu.Item
                        className={MENU_ITEM}
                        onSelect={() => copyTabLink(tab.id)}
                      >
                        <Link2 />
                        Copiar link
                      </ContextMenu.Item>
                    </ContextMenu.Content>
                  </ContextMenu.Portal>
                </ContextMenu.Root>
              );
            })}
          </div>
        </div>
      ) : null}
    </>
  );
}
