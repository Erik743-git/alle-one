"use client";

import Image from "next/image";
import { useEffect, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Cache-bust quando a arte do login mudar. */
export const AUTH_HERO_SRC = "/login-hero.png?v=6";

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
        "font-sans relative flex h-dvh max-h-dvh items-center justify-center overflow-hidden bg-[#020b1b] px-4 lg:grid lg:grid-cols-[minmax(0,0.75fr)_minmax(420px,470px)_minmax(8rem,20vw)] lg:px-0",
        className,
      )}
    >
      <Image
        src={AUTH_HERO_SRC}
        alt=""
        fill
        priority
        unoptimized
        quality={100}
        sizes="100vw"
        className="pointer-events-none select-none object-cover object-[48%_42%] scale-[1.22] origin-center"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[#020b1b]/10 lg:bg-gradient-to-r lg:from-transparent lg:via-transparent lg:to-[#020b1b]/40"
      />

      <div
        className={cn(
          "relative z-10 w-full max-w-[380px] animate-[fadeIn_0.5s_ease-out] sm:max-w-[430px] lg:col-start-2 lg:max-w-none",
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
