"use client";

import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import Sidebar from "./sidebar";
import { SidebarProvider, useSidebar } from "./sidebar-context";

function AppShellMain({ children }: { children: React.ReactNode }) {
  const { setMobileOpen } = useSidebar();

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-md md:hidden">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Abrir menu"
          className="size-11 shrink-0"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="size-5" />
        </Button>
        <span className="text-sm font-bold tracking-wide text-foreground">
          Alle One
        </span>
      </header>

      <main
        className={[
          "min-h-screen w-full min-w-0 box-border",
          "max-md:pl-0",
          "md:pl-[var(--sidebar-width,272px)]",
          "md:transition-[padding-left] md:duration-200 md:ease-out",
          "motion-reduce:md:transition-none",
        ].join(" ")}
      >
        <div className="w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-9 xl:px-10 2xl:px-12">
          <div className="mx-auto w-full max-w-[1800px]">{children}</div>
        </div>
      </main>
    </>
  );
}

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <div className="font-sans relative min-h-screen overflow-x-hidden bg-background text-foreground">
        <div
          className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_100%_60%_at_50%_-15%,rgba(18,181,217,0.06),transparent_55%),radial-gradient(ellipse_80%_50%_at_100%_50%,rgba(59,130,246,0.04),transparent_50%)] dark:bg-[radial-gradient(ellipse_100%_60%_at_50%_-15%,rgba(18,181,217,0.11),transparent_50%),radial-gradient(ellipse_80%_50%_at_100%_50%,rgba(59,130,246,0.06),transparent_45%)]"
          aria-hidden
        />
        <div className="relative z-10">
          <Sidebar />
          <AppShellMain>{children}</AppShellMain>
        </div>
      </div>
    </SidebarProvider>
  );
}
