"use client";

import { ConfirmProvider } from "@/components/providers/confirm-provider";
import { ToastHost } from "@/components/ui/toast-host";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ConfirmProvider>
      {children}
      <ToastHost />
    </ConfirmProvider>
  );
}
