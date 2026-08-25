"use client";

import { memo, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AlleBrandLogo } from "@/components/brand/alle-brand-logo";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  DollarSign,
  ClipboardList,
  FileText,
  ShieldCheck,
  Boxes,
  PanelLeftClose,
  PanelLeftOpen,
  CalendarRange,
  Package,
  FolderKanban,
  Ticket,
  MonitorDot,
  Plus,
} from "lucide-react";
import {
  canAccessAdmin,
  canAccessAplicativos,
  canAccessConsole,
  canAccessInventario,
  canAccessProjetos,
  canAccessDashboard,
  canAccessFinanceiro,
  canAccessGmud,
  canAccessRelatorios,
  canAccessRendimento,
  canAccessTickets,
  canCreateTicket,
} from "@/lib/access-control";
import ThemeToggle from "@/components/theme/theme-toggle";
import { UserAccountMenu } from "@/components/layout/user-account-menu";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { useSidebar } from "./sidebar-context";
import { useAuth } from "@/lib/use-auth";
import { SidebarCompanySwitcher } from "./sidebar-company-switcher";

const ModalAplicativos = dynamic(
  () => import("@/components/modals/modal-aplicativos"),
  { ssr: false },
);

type MenuItem = {
  name: string;
  href?: string;
  icon: React.ComponentType<{
    size?: number;
    className?: string;
    strokeWidth?: number;
  }>;
  visible: boolean;
  action?: () => void;
  active?: boolean;
  highlight?: boolean;
};

/** Recalculado no render — não usar `visible` no topo do módulo (SSR/login). */
function buildMenuItems(): MenuItem[] {
  return [
    {
      name: "Novo ticket",
      href: "/tickets/new",
      icon: Plus,
      visible: canCreateTicket(),
      highlight: true,
    },
    {
      name: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
      visible: canAccessDashboard(),
    },
    {
      name: "Console",
      href: "/console",
      icon: MonitorDot,
      visible: canAccessConsole(),
    },
    {
      name: "Financeiro",
      href: "/financeiro",
      icon: DollarSign,
      visible: canAccessFinanceiro(),
    },
    {
      name: "GMUD",
      href: "/gmud",
      icon: ClipboardList,
      visible: canAccessGmud(),
    },
    {
      name: "Relatórios",
      href: "/gerador-relatorios",
      icon: FileText,
      visible: canAccessRelatorios(),
    },
    {
      name: "Apontamentos",
      href: "/apontamentos",
      icon: CalendarRange,
      visible: canAccessRendimento(),
    },
    {
      name: "Tickets",
      href: "/tickets",
      icon: Ticket,
      visible: canAccessTickets(),
    },
    {
      name: "Inventário",
      href: "/inventario",
      icon: Package,
      visible: canAccessInventario(),
    },
    {
      name: "Projetos",
      href: "/projetos",
      icon: FolderKanban,
      visible: canAccessProjetos(),
    },
    {
      name: "Aplicativos",
      icon: Boxes,
      visible: canAccessAplicativos(),
    },
    {
      name: "Administração",
      href: "/admin",
      icon: ShieldCheck,
      visible: canAccessAdmin(),
    },
  ];
}

/** Caixa fixa para ícones — escala em telas grandes quando o menu está recolhido. */
function NavIconSlot({
  children,
  collapsed,
  className,
}: {
  children: React.ReactNode;
  collapsed?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center",
        collapsed
          ? "h-9 w-9 xl:h-10 xl:w-10 2xl:h-11 2xl:w-11"
          : "size-8 max-md:size-10 xl:size-9",
        className,
      )}
    >
      {children}
    </span>
  );
}

type SidebarNavProps = {
  collapsed: boolean;
  onNavigate?: () => void;
};

const SidebarNav = memo(function SidebarNav({
  collapsed,
  onNavigate,
}: SidebarNavProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [modalAplicativos, setModalAplicativos] = useState(false);

  const menu = useMemo(() => buildMenuItems(), [user]);
  const visibleMenu = useMemo(
    () => menu.filter((item) => item.visible),
    [menu],
  );
  const pinnedItems = useMemo(
    () => visibleMenu.filter((item) => item.highlight),
    [visibleMenu],
  );
  const scrollItems = useMemo(
    () => visibleMenu.filter((item) => !item.highlight),
    [visibleMenu],
  );

  const navIconClass = collapsed
    ? "size-[18px] xl:size-5 2xl:size-[22px]"
    : "size-[18px] max-md:size-5 xl:size-[19px]";
  const highlightIconClass = collapsed
    ? "size-4 xl:size-[18px] 2xl:size-5"
    : "size-4 max-md:size-[18px]";

  const itemClass = (active: boolean, highlight?: boolean) =>
    cn(
      "flex items-center overflow-hidden rounded-lg font-semibold transition-colors duration-150",
      collapsed
        ? "mx-auto h-9 w-9 shrink-0 justify-center gap-0 p-0 xl:h-10 xl:w-10 2xl:h-11 2xl:w-11"
        : highlight
          ? "h-9 w-full gap-2 px-2.5 max-md:h-11 max-md:px-3"
          : "min-h-10 w-full gap-2.5 px-3 py-2 max-md:min-h-12 max-md:gap-3 max-md:px-4 max-md:py-2.5",
      !collapsed && "text-[13px] max-md:text-sm xl:text-sm",
      highlight
        ? cn(
            "text-white shadow-sm shadow-[#12b5d9]/20",
            active
              ? "bg-[#0e9cb8]"
              : "bg-[#12b5d9] hover:bg-[#14c4eb]",
          )
        : active
          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[0_0_0_1px_rgba(18,181,217,0.25)]"
          : "text-sidebar-foreground/80 hover:bg-muted",
    );

  function renderMenuItem(item: MenuItem) {
    const Icon = item.icon;
    const active =
      item.href
        ? pathname === item.href || pathname.startsWith(`${item.href}/`)
        : item.active;

    if (item.name === "Aplicativos") {
      return (
        <button
          key={item.name}
          type="button"
          title={collapsed ? item.name : undefined}
          onClick={() => {
            setModalAplicativos(true);
            onNavigate?.();
          }}
          className={cn(itemClass(modalAplicativos), !collapsed && "w-full text-left")}
        >
          <NavIconSlot collapsed={collapsed}>
            <Icon className={cn("block shrink-0", navIconClass)} strokeWidth={2} />
          </NavIconSlot>
          {!collapsed ? (
            <span className="min-w-0 flex-1 truncate text-left tracking-tight">
              {item.name}
            </span>
          ) : null}
        </button>
      );
    }

    return (
      <Link
        key={item.href ?? item.name}
        href={item.href!}
        title={collapsed ? item.name : undefined}
        onClick={() => onNavigate?.()}
        className={cn(itemClass(!!active, item.highlight), !collapsed && "w-full")}
      >
        <NavIconSlot
          collapsed={collapsed}
          className={item.highlight ? "size-8 xl:size-9 2xl:size-10" : undefined}
        >
          <Icon
            className={cn(
              "block shrink-0",
              item.highlight ? highlightIconClass : navIconClass,
            )}
            strokeWidth={2}
          />
        </NavIconSlot>
        {!collapsed ? (
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-left tracking-tight",
              item.highlight && "text-xs max-md:text-sm",
            )}
          >
            {item.name}
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <>
      <nav
        className={cn(
          "sidebar-nav-scroll flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain",
          collapsed ? "items-center px-0" : "px-2.5 md:px-3",
        )}
        aria-label="Módulos do portal"
      >
        {pinnedItems.length > 0 ? (
          <div
            className={cn(
              "sticky top-0 z-10 w-full shrink-0 bg-sidebar pt-2 pb-1",
              collapsed && "flex justify-center",
            )}
          >
            <div className={cn("flex w-full flex-col gap-1", collapsed && "w-auto items-center")}>
              {pinnedItems.map((item) => renderMenuItem(item))}
            </div>
            {!collapsed ? (
              <div
                className="mx-0.5 mt-1.5 h-px bg-sidebar-border/60"
                aria-hidden
              />
            ) : null}
          </div>
        ) : null}

        <div
          className={cn(
            "flex w-full flex-col gap-1 pb-2 pt-1",
            collapsed && "items-center",
          )}
        >
          {scrollItems.map((item) => renderMenuItem(item))}
        </div>
      </nav>

      <ModalAplicativos
        open={modalAplicativos}
        onOpenChange={setModalAplicativos}
      />
    </>
  );
});

const SidebarBrand = memo(function SidebarBrand({
  collapsed,
}: {
  collapsed: boolean;
}) {
  if (collapsed) {
    return (
      <div className="flex w-full shrink-0 flex-col items-center gap-2 border-b border-sidebar-border py-3 xl:gap-2.5 xl:py-3.5">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#08182f] xl:h-11 xl:w-11 2xl:h-12 2xl:w-12"
          title="Alle One"
        >
          <Image
            src="/alle-simbolo.png"
            alt="Alle"
            width={24}
            height={24}
            className="h-6 w-6 object-contain xl:h-7 xl:w-7 2xl:h-8 2xl:w-8"
            priority
          />
        </div>
        <UserAccountMenu collapsed />
        <ThemeToggle collapsed />
      </div>
    );
  }

  return (
    <div className="sidebar-brand shrink-0 border-b border-sidebar-border px-4 py-3 overflow-hidden">
      <div className="flex w-full flex-col gap-1.5">
        <div className="flex w-full items-end gap-2">
          <div className="flex min-w-0 flex-1 justify-center">
            <AlleBrandLogo priority className="w-full max-w-[168px]" />
          </div>
          <div className="flex shrink-0 translate-y-5 flex-col items-center gap-2">
            <UserAccountMenu />
            <ThemeToggle />
          </div>
        </div>
        <p className="text-center text-[11px] font-extrabold tracking-[0.18em] text-sidebar-foreground/80">
          ALLE ONE
        </p>
      </div>
    </div>
  );
});

function DesktopSidebar() {
  const { collapsed, toggleCollapsed, endLayoutAnimation } = useSidebar();

  return (
    <aside
      className={cn(
        "font-sans fixed left-0 top-0 z-40 hidden h-dvh max-h-dvh flex-col overflow-hidden",
        "border-r border-sidebar-border bg-sidebar shadow-[2px_0_16px_rgba(0,0,0,0.12)]",
        "transition-[width] duration-200 ease-out motion-reduce:transition-none",
        "[contain:layout_style_paint] md:flex",
        collapsed
          ? "w-[76px] xl:w-[88px] 2xl:w-[92px]"
          : "w-[272px]",
      )}
      onTransitionEnd={(event) => {
        if (event.propertyName === "width") {
          endLayoutAnimation();
        }
      }}
    >
      <SidebarBrand collapsed={collapsed} />
      <SidebarCompanySwitcher collapsed={collapsed} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <SidebarNav collapsed={collapsed} />
      </div>
      <div
        className={cn(
          "shrink-0 border-t border-sidebar-border p-2",
          collapsed ? "flex justify-center" : "px-3",
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size={collapsed ? "icon" : "sm"}
          className={cn(
            "overflow-hidden text-sidebar-foreground/80",
            collapsed
              ? "mx-auto h-10 w-10 shrink-0 xl:h-11 xl:w-11"
              : "w-full justify-start gap-2",
          )}
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-[18px] shrink-0 xl:size-5 2xl:size-[22px]" strokeWidth={2} />
          ) : (
            <>
              <PanelLeftClose className="size-4 shrink-0" />
              <span className="truncate">Recolher menu</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}

function MobileSidebar() {
  const { mobileOpen, setMobileOpen } = useSidebar();

  return (
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <SheetContent
        side="left"
        className="w-[min(100vw-1.25rem,20rem)] border-sidebar-border bg-sidebar p-0 text-sidebar-foreground sm:w-[min(100vw-2rem,22rem)]"
        showCloseButton
      >
        <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
        <div className="flex h-dvh max-h-dvh flex-col overflow-hidden">
          <SidebarBrand collapsed={false} />
          <SidebarCompanySwitcher collapsed={false} />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <SidebarNav
              collapsed={false}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function Sidebar() {
  return (
    <>
      <DesktopSidebar />
      <MobileSidebar />
    </>
  );
}
