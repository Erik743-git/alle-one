"use client";

import { useEffect, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Cache-bust quando a arte do login mudar. */
export const AUTH_HERO_SRC = "/login-hero.jpg?v=8";

type AuthShellProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

/**
 * Fundo compartilhado das telas de autenticação (login, 2FA, primeiro acesso,
 * esqueci/redefinir senha). Card alinhado à direita, um pouco para a esquerda.
 */
export function AuthShell({
  children,
  className,
  contentClassName,
}: AuthShellProps) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("login-lock");
    return () => root.classList.remove("login-lock");
  }, []);

  return (
    <main
      className={cn(
        "font-sans relative flex h-dvh max-h-dvh items-center justify-center overflow-hidden bg-[#0a1018] px-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(400px,460px)_minmax(2rem,12vw)] lg:justify-items-end lg:px-0",
        className,
      )}
    >
      {/* img nativo + sem scale evita borrar JPEG em telas grandes */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={AUTH_HERO_SRC}
        alt=""
        decoding="sync"
        fetchPriority="high"
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover object-[left_center] [image-rendering:auto]"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[#0a1018]/5 lg:bg-gradient-to-r lg:from-transparent lg:via-[#0a1018]/10 lg:to-[#0a1018]/55"
      />

      <div
        className={cn(
          "relative z-10 w-full max-w-[380px] animate-[fadeIn_0.5s_ease-out] sm:max-w-[430px] lg:col-start-2 lg:max-w-none lg:-translate-x-10",
          contentClassName,
        )}
      >
        {children}
      </div>
    </main>
  );
}

export function AuthShellFallback() {
  return (
    <AuthShell>
      <div className="flex min-h-[12rem] items-center justify-center rounded-[20px] border border-white/10 bg-[#08182f]/88 backdrop-blur-xl">
        <Loader2 className="h-8 w-8 animate-spin text-[#12b5d9]" />
      </div>
    </AuthShell>
  );
}
