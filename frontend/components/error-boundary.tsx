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
  }

  private handleReload = () => {
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
