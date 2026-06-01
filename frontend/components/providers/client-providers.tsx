"use client";

import { ToastHost } from "@/components/ui/toast-host";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ToastHost />
    </>
  );
}
