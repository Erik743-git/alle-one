"use client";

import { useEffect } from "react";
import { ConfirmProvider } from "@/components/providers/confirm-provider";
import { ErrorBoundary } from "@/components/error-boundary";
import { SessionIdleGuard } from "@/components/auth/session-idle-guard";
import { PwaInstallHint } from "@/components/pwa/install-hint";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { ToastHost } from "@/components/ui/toast-host";
import { AuthProvider } from "@/lib/auth-context";

const CHUNK_RELOAD_KEY = "alleone_chunk_reload_once";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    try {
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    } catch {
      // ignore
    }
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <ConfirmProvider>
          <SessionIdleGuard />
          {children}
          <ToastHost />
          <ServiceWorkerRegister />
          <PwaInstallHint />
        </ConfirmProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
