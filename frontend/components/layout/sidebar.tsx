"use client";

import { useState } from "react";
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

const SessionPanel = dynamic(
  () => import("@/components/layout/session-panel"),
  { ssr: false }
);

const ModalAplicativos = dynamic(
  () => import("@/components/modals/modal-aplicativos"),
  { ssr: false }
);

type MenuItem = {
  name: string;
  href?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  visible: boolean;
  action?: () => void;
  active?: boolean;
};

export default function Sidebar() {
  const pathname = usePathname();
  const [modalAplicativos, setModalAplicativos] = useState(false);

  const menu: MenuItem[] = [
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
      action: () => setModalAplicativos(true),
      active: modalAplicativos,
    },
    {
      name: "Administração",
      href: "/admin",
      icon: ShieldCheck,
      visible: canAccessAdmin(),
    },
  ];

  return (
    <>
      <aside className="font-sans fixed left-0 top-0 z-40 hidden h-screen w-[260px] flex-col border-r border-sidebar-border bg-sidebar shadow-[4px_0_32px_rgba(0,0,0,0.25)] backdrop-blur-md md:flex">
        <div className="flex flex-col gap-1 border-b border-sidebar-border px-6 py-6">
          <div className="flex items-center justify-center gap-3">
            <Image
              src="/Logo_White.png"
              alt="Alle One"
              width={190}
              height={68}
              priority
              className="h-auto w-[190px] dark:hidden"
            />
            <Image
              src="/logo-alle.png"
              alt="Alle One"
              width={190}
              height={68}
              priority
              className="hidden h-auto w-[190px] dark:block"
            />
            <ThemeToggle />
          </div>
          <p className="text-center text-[12px] font-extrabold tracking-[0.18em] text-sidebar-foreground/80">
            ALLE ONE
          </p>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-3 pb-4 pt-4">
          {menu
            .filter((item) => item.visible)
            .map((item) => {
              const Icon = item.icon;
              const active =
                item.href
                  ? pathname === item.href ||
                    pathname.startsWith(`${item.href}/`)
                  : item.active;

              if (item.action) {
                return (
                  <button
                    key={item.name}
                    type="button"
                    onClick={item.action}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[0_0_0_1px_rgba(18,181,217,0.25)]"
                        : "text-sidebar-foreground/80 hover:bg-muted"
                    }`}
                  >
                    <Icon size={18} />
                    {item.name}
                  </button>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href!}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[0_0_0_1px_rgba(18,181,217,0.25)]"
                      : "text-sidebar-foreground/80 hover:bg-muted"
                  }`}
                >
                  <Icon size={18} />
                  {item.name}
                </Link>
              );
            })}

          <div className="mt-auto">
            <SessionPanel />
          </div>
        </nav>
      </aside>

      <ModalAplicativos
        open={modalAplicativos}
        onOpenChange={setModalAplicativos}
      />
    </>
  );
}