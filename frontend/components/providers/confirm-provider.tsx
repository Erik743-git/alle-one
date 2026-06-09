"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AppAlert,
  type AppAlertVariant,
} from "@/components/ui/app-alert";

export type ConfirmOptions = {
  title?: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: AppAlertVariant;
};

type ConfirmState = ConfirmOptions & { open: true };

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setState({ open: true, ...options });
    });
  }, []);

  const finish = useCallback((result: boolean) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setState(null);
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) finish(false);
    },
    [finish],
  );

  const handleConfirm = useCallback(() => {
    finish(true);
  }, [finish]);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state ? (
        <AppAlert
          open={state.open}
          onOpenChange={handleOpenChange}
          title={state.title ?? "Confirmar"}
          description={state.description}
          variant={state.variant ?? "warning"}
          confirmText={state.confirmText ?? "Confirmar"}
          cancelText={state.cancelText ?? "Cancelar"}
          onConfirm={handleConfirm}
        />
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm deve ser usado dentro de ConfirmProvider.");
  }
  return ctx.confirm;
}
