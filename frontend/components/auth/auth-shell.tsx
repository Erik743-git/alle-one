"use client";

import Image from "next/image";
import { useEffect, type CSSProperties, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Arte do login. Preferir `login-hero-master.png` (3840×2160) e rodar
 * `npm run build:login-hero` para gerar variantes nítidas.
 */
export const AUTH_HERO_SRC = "/login-hero-2x.jpg";

/** Ancora no topo; prioriza personagem à esquerda (arte 16:9). */
const AUTH_HERO_OBJECT_POSITION = "28% top";

/** Largura do painel hero no desktop — alinhado ao padding do formulário. */
const AUTH_HERO_DESKTOP_WIDTH = "clamp(20rem, 38vw, 44rem)";

/**
 * Largura real exibida: painel estreito no desktop, tela cheia no mobile.
 * Em telas retina o Next/Image escolhe ~2× essa largura (até 1920px).
 */
const AUTH_HERO_SIZES = `(min-width: 1024px) ${AUTH_HERO_DESKTOP_WIDTH}, 100vw`;

type AuthHeroImageProps = {
  className?: string;
};

function AuthHeroImage({ className }: AuthHeroImageProps) {
  return (
    <Image
      src={AUTH_HERO_SRC}
      alt=""
      fill
      priority
      quality={95}
      sizes={AUTH_HERO_SIZES}
      className={cn(
        "select-none object-cover object-[28%_top]",
        className,
      )}
      style={{ objectPosition: AUTH_HERO_OBJECT_POSITION }}
    />
  );
}

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
        {/*
          Desktop: hero só no painel esquerdo — evita esticar JPEG em telas 2K/4K.
          Mobile: hero em tela cheia com scrim leve para o card.
        */}
        <div
          className="absolute inset-0 overflow-hidden lg:inset-y-0 lg:left-0 lg:right-auto lg:w-[var(--auth-hero-width)]"
          style={
            {
              "--auth-hero-width": AUTH_HERO_DESKTOP_WIDTH,
            } as CSSProperties
          }
        >
          <div className="relative h-full min-h-full w-full">
            <AuthHeroImage />
          </div>
        </div>
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
