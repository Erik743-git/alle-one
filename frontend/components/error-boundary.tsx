"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

const CHUNK_RELOAD_KEY = "alleone_chunk_reload_once";

function isChunkLoadError(error: Error): boolean {
  const name = error.name || "";
  const message = error.message || "";
  return (
    name === "ChunkLoadError" ||
    /Loading chunk [\d]+ failed/i.test(message) ||
    /Failed to load chunk/i.test(message) ||
    /ChunkLoadError/i.test(message) ||
    /Loading CSS chunk/i.test(message) ||
    /\/_next\/static\//i.test(message)
  );
}

/** Captura erros de renderização e evita tela branca sem feedback. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || "Erro inesperado na interface.",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);

    // Pós-deploy / origem lenta: HTML antigo referencia chunks novos → reload 1x.
    if (typeof window === "undefined" || !isChunkLoadError(error)) return;
    try {
      if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1") return;
      sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
      window.location.reload();
    } catch {
      // sessionStorage indisponível — deixa a UI de erro com botão de reload.
    }
  }

  private handleReload = () => {
    try {
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    } catch {
      // ignore
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center font-sans">
          <h1 className="text-lg font-semibold">Algo deu errado</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            {this.state.message}
          </p>
          <Button type="button" onClick={this.handleReload}>
            Recarregar página
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
