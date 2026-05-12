"use client";

import Sidebar from "./sidebar";

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_100%_60%_at_50%_-15%,rgba(18,181,217,0.06),transparent_55%),radial-gradient(ellipse_80%_50%_at_100%_50%,rgba(59,130,246,0.04),transparent_50%)] dark:bg-[radial-gradient(ellipse_100%_60%_at_50%_-15%,rgba(18,181,217,0.11),transparent_50%),radial-gradient(ellipse_80%_50%_at_100%_50%,rgba(59,130,246,0.06),transparent_45%)]"
        aria-hidden
      />
      <div className="relative z-10">
        <Sidebar />

        <main className="min-h-screen w-full pl-0 md:pl-[260px]">
          <div className="w-full px-4 py-7 sm:px-6 sm:py-8 lg:px-8 lg:py-9 xl:px-10 2xl:px-12">
            <div className="mx-auto w-full max-w-[1800px]">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}