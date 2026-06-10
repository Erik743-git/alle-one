"use client";

import { ConfirmProvider } from "@/components/providers/confirm-provider";
import { ErrorBoundary } from "@/components/error-boundary";
import { ToastHost } from "@/components/ui/toast-host";
import { AuthProvider } from "@/lib/auth-context";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ConfirmProvider>
          {children}
          <ToastHost />
        </ConfirmProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
