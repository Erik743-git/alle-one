"use client";

import { ConfirmProvider } from "@/components/providers/confirm-provider";
import { ErrorBoundary } from "@/components/error-boundary";
import { ToastHost } from "@/components/ui/toast-host";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <ConfirmProvider>
        {children}
        <ToastHost />
      </ConfirmProvider>
    </ErrorBoundary>
  );
}
