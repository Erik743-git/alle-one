"use client";

import { useEffect, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Cache-bust quando a arte do login mudar. */
export const AUTH_HERO_SRC = "/login-hero.jpg?v=16";

/** Ancora no topo e equilibra personagem (esq.) com logo Alle (dir.) ao recortar. */
const AUTH_HERO_OBJECT_POSITION = "38% top";

type AuthShellProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

/**
 * Fundo compartilhado das telas de autenticação (login, 2FA, primeiro acesso,
 * esqueci/redefinir senha). Desktop: hero à esquerda. Mobile: hero suave + card central.
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
        "font-sans relative isolate flex min-h-dvh w-full justify-center bg-[#c8e4f4]",
        "overflow-x-hidden overflow-y-auto overscroll-y-contain",
        "px-4 py-5 sm:px-5 sm:py-6",
        "lg:h-dvh lg:max-h-dvh lg:items-center lg:overflow-hidden lg:py-0 lg:px-0",
        "lg:grid lg:grid-cols-[1fr_minmax(400px,440px)_minmax(1.5rem,5vw)] lg:justify-items-end",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-[#c8e4f4]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={AUTH_HERO_SRC}
          alt=""
          decoding="sync"
          fetchPriority="high"
          className="absolute inset-0 h-full w-full select-none object-cover"
          style={{ objectPosition: AUTH_HERO_OBJECT_POSITION }}
        />
        {/* Mobile: scrim leve para o card escuro sobre a arte */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#c8e4fc]/25 via-transparent to-[#c8e4fc]/35 lg:hidden" />
      </div>

      <div
        className={cn(
          "relative z-10 my-auto w-full max-w-[min(100%,22.5rem)] animate-[fadeIn_0.5s_ease-out] sm:max-w-[27rem]",
          "lg:col-start-2 lg:my-0 lg:max-w-none lg:-translate-x-6 xl:-translate-x-10",
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
