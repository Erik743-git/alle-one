"use client";

import { useEffect, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Cache-bust quando a arte do login mudar. */
export const AUTH_HERO_SRC = "/login-hero.jpg?v=17";
export const AUTH_HERO_SRC_2X = "/login-hero-2x.jpg?v=17";

/** Ancora no topo; prioriza personagem à esquerda (arte 16:9). */
const AUTH_HERO_OBJECT_POSITION = "28% top";

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
        "lg:flex lg:justify-start lg:pl-[clamp(20rem,38vw,44rem)]",
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
          srcSet={`${AUTH_HERO_SRC} 1024w, ${AUTH_HERO_SRC_2X} 1920w`}
          sizes="100vw"
          alt=""
          decoding="sync"
          fetchPriority="high"
          width={1024}
          height={576}
          className="absolute inset-0 h-full w-full select-none object-cover"
          style={{ objectPosition: AUTH_HERO_OBJECT_POSITION }}
        />
        {/* Mobile: scrim leve para o card escuro sobre a arte */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#c8e4fc]/25 via-transparent to-[#c8e4fc]/35 lg:hidden" />
      </div>

      <div
        className={cn(
          "relative z-10 my-auto w-full max-w-[min(100%,22.5rem)] animate-[fadeIn_0.5s_ease-out] sm:max-w-[27rem]",
          "lg:my-0 lg:w-[min(100%,27.5rem)] lg:max-w-none",
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
