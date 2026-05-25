"use client";

import { memo, useState } from "react";
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
} from "lucide-react";
import {
  canAccessAdmin,
  canAccessAplicativos,
  canAccessDashboard,
  canAccessFinanceiro,
  canAccessGmud,
  canAccessRelatorios,
} from "@/lib/access-control";
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
  icon: React.ComponentType<{ size?: number; className?: string }>;
  visible: boolean;
  action?: () => void;
  active?: boolean;
};

const MENU_ITEMS: MenuItem[] = [
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

const NavLabel = memo(function NavLabel({
  children,
  collapsed,
}: {
  children: string;
  collapsed: boolean;
}) {
  return (
    <span
      className={cn(
        "truncate transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
        collapsed
          ? "pointer-events-none w-0 scale-x-0 opacity-0"
          : "w-auto scale-x-100 opacity-100",
      )}
    >
      {children}
    </span>
  );
});

type SidebarNavProps = {
  collapsed: boolean;
  onNavigate?: () => void;
};

const SidebarNav = memo(function SidebarNav({
  collapsed,
  onNavigate,
}: SidebarNavProps) {
  const pathname = usePathname();
  const [modalAplicativos, setModalAplicativos] = useState(false);

  const menu = MENU_ITEMS;

  const itemClass = (active: boolean) =>
    cn(
      "flex items-center overflow-hidden rounded-xl text-sm font-semibold transition-colors duration-150",
      collapsed ? "justify-center gap-0 px-2 py-3" : "gap-3 px-4 py-3",
      active
        ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[0_0_0_1px_rgba(18,181,217,0.25)]"
        : "text-sidebar-foreground/80 hover:bg-muted",
    );

  return (
    <>
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden overscroll-contain px-2 pb-2 pt-2 md:px-3">
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
                    !collapsed && "text-left",
                  )}
                >
                  <Icon size={18} className="shrink-0" />
                  <NavLabel collapsed={collapsed}>{item.name}</NavLabel>
                </button>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href!}
                title={collapsed ? item.name : undefined}
                onClick={() => onNavigate?.()}
                className={itemClass(!!active)}
              >
                <Icon size={18} className="shrink-0" />
                <NavLabel collapsed={collapsed}>{item.name}</NavLabel>
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
      <div className="flex shrink-0 flex-col items-center gap-2 border-b border-sidebar-border px-2 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-xs font-black text-primary">
          A1
        </div>
        <ThemeToggle />
      </div>
    );
  }

  return (
    <div className="shrink-0 border-b border-sidebar-border px-4 py-5">
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
        "font-sans fixed left-0 top-0 z-40 hidden h-screen flex-col overflow-hidden",
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
          collapsed ? "px-2 py-2" : "px-2 py-3 md:px-3",
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
            "w-full overflow-hidden text-sidebar-foreground/80",
            !collapsed && "justify-start gap-2",
          )}
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4 shrink-0" />
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
        className="w-[min(100vw-2rem,280px)] border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
        showCloseButton
      >
        <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
        <div className="flex h-full flex-col">
          <SidebarBrand collapsed={false} />
          <SidebarNav
            collapsed={false}
            onNavigate={() => setMobileOpen(false)}
          />
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
