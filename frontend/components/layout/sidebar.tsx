"use client";

import { memo, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
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
  Mail,
  Package,
} from "lucide-react";
import {
  canAccessAdmin,
  canAccessAplicativos,
  canAccessCorreio,
  canAccessInventario,
  canAccessDashboard,
  canAccessFinanceiro,
  canAccessGmud,
  canAccessRelatorios,
  canAccessRendimento,
} from "@/lib/access-control";
import { MailboxUnreadBadge } from "@/components/layout/mailbox-unread-badge";
import ThemeToggle from "@/components/theme/theme-toggle";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  useSidebar,
  SIDEBAR_WIDTH_COLLAPSED,
  SIDEBAR_WIDTH_EXPANDED,
} from "./sidebar-context";
import { useAuth } from "@/lib/use-auth";

const SessionPanel = dynamic(
  () => import("@/components/layout/session-panel"),
  { ssr: false, loading: () => <div className="h-16 shrink-0" aria-hidden /> },
);

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
};

/** Recalculado no render — não usar `visible` no topo do módulo (SSR/login). */
function buildMenuItems(): MenuItem[] {
  return [
    {
      name: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
      visible: canAccessDashboard(),
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
      name: "Rendimento",
      href: "/rendimento",
      icon: CalendarRange,
      visible: canAccessRendimento(),
    },
    {
      name: "Correio",
      href: "/correio",
      icon: Mail,
      visible: canAccessCorreio(),
    },
    {
      name: "Inventário",
      href: "/inventario",
      icon: Package,
      visible: canAccessInventario(),
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

/** Caixa fixa para ícones — mesma medida dos botões recolhidos (40×40). */
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
        collapsed ? "h-10 w-10" : "size-9",
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

  const iconSize = collapsed ? 18 : 20;

  const itemClass = (active: boolean) =>
    cn(
      "flex items-center overflow-hidden rounded-xl text-sm font-semibold transition-colors duration-150",
      collapsed
        ? "mx-auto h-10 w-10 shrink-0 justify-center gap-0 p-0"
        : "min-h-[2.875rem] w-full gap-3 px-3.5 py-3",
      active
        ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[0_0_0_1px_rgba(18,181,217,0.25)]"
        : "text-sidebar-foreground/80 hover:bg-muted",
    );

  return (
    <>
      <nav
        className={cn(
          "sidebar-nav-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden overscroll-contain pb-2 pt-2",
          collapsed ? "items-center px-0" : "px-2.5 md:px-3",
        )}
        aria-label="Módulos do portal"
      >
        {menu
          .filter((item) => item.visible)
          .map((item) => {
            const Icon = item.icon;
            const active =
              item.href
                ? pathname === item.href ||
                  pathname.startsWith(`${item.href}/`)
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
                  className={cn(
                    itemClass(modalAplicativos),
                    !collapsed && "w-full text-left",
                  )}
                >
                  <NavIconSlot collapsed={collapsed}>
                    <Icon size={iconSize} className="shrink-0" strokeWidth={2} />
                  </NavIconSlot>
                  {!collapsed ? (
                    <span className="min-w-0 flex-1 truncate text-left tracking-tight">
                      {item.name}
                    </span>
                  ) : null}
                </button>
              );
            }

            const isCorreio = item.name === "Correio";

            return (
              <Link
                key={item.href}
                href={item.href!}
                title={collapsed ? item.name : undefined}
                onClick={() => onNavigate?.()}
                className={cn(itemClass(!!active), !collapsed && "w-full")}
              >
                <NavIconSlot collapsed={collapsed}>
                  <Icon size={iconSize} className="shrink-0" strokeWidth={2} />
                  {isCorreio && collapsed ? (
                    <MailboxUnreadBadge variant="collapsed" />
                  ) : null}
                </NavIconSlot>
                {!collapsed ? (
                  <>
                    <span className="min-w-0 flex-1 truncate text-left tracking-tight">
                      {item.name}
                    </span>
                    {isCorreio ? (
                      <MailboxUnreadBadge variant="inline" />
                    ) : null}
                  </>
                ) : null}
              </Link>
            );
          })}
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
      <div className="flex w-full shrink-0 flex-col items-center gap-2 border-b border-sidebar-border py-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#08182f]"
          title="Alle One"
        >
          <Image
            src="/alle-simbolo.png"
            alt="Alle"
            width={24}
            height={24}
            className="h-6 w-6 object-contain"
            priority
          />
        </div>
        <ThemeToggle collapsed />
      </div>
    );
  }

  return (
    <div className="sidebar-brand shrink-0 border-b border-sidebar-border px-4 py-3 max-h-[min(24vh,10rem)] overflow-hidden">
      <div className="relative">
        <div className="absolute right-0 top-0">
          <ThemeToggle />
        </div>

        <div className="flex flex-col items-center gap-2 pr-10">
          <div className="flex w-full justify-center">
            <Image
              src="/Logo_White.png"
              alt="Alle One"
              width={190}
              height={68}
              priority
              className="h-auto w-full max-w-[168px] dark:hidden"
            />
            <Image
              src="/logo-alle.png"
              alt="Alle One"
              width={190}
              height={68}
              priority
              className="hidden h-auto w-full max-w-[168px] dark:block"
            />
          </div>
          <p className="text-center text-[11px] font-extrabold tracking-[0.18em] text-sidebar-foreground/80">
            ALLE ONE
          </p>
        </div>
      </div>
    </div>
  );
});

function DesktopSidebar() {
  const { collapsed, toggleCollapsed, endLayoutAnimation } = useSidebar();
  const width = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;

  return (
    <aside
      className={cn(
        "font-sans fixed left-0 top-0 z-40 hidden h-dvh max-h-dvh flex-col overflow-hidden",
        "border-r border-sidebar-border bg-sidebar shadow-[2px_0_16px_rgba(0,0,0,0.12)]",
        "transition-[width] duration-200 ease-out motion-reduce:transition-none",
        "[contain:layout_style_paint] md:flex",
      )}
      style={{ width }}
      onTransitionEnd={(event) => {
        if (event.propertyName === "width") {
          endLayoutAnimation();
        }
      }}
    >
      <SidebarBrand collapsed={collapsed} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <SidebarNav collapsed={collapsed} />
      </div>
      <div
        className={cn(
          "shrink-0 border-t border-sidebar-border",
          collapsed ? "flex justify-center px-0 py-2" : "px-2 py-3 md:px-3",
        )}
      >
        <SessionPanel collapsed={collapsed} />
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
              ? "mx-auto h-10 w-10 shrink-0"
              : "w-full justify-start gap-2",
          )}
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-[18px] shrink-0" strokeWidth={2} />
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
        className="w-[min(100vw-2rem,300px)] border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
        showCloseButton
      >
        <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
        <div className="flex h-dvh max-h-dvh flex-col overflow-hidden">
          <SidebarBrand collapsed={false} />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <SidebarNav
              collapsed={false}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
          <div className="shrink-0 border-t border-sidebar-border px-3 py-3">
            <SessionPanel collapsed={false} />
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
