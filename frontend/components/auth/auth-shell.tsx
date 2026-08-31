"use client";

import { useEffect, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const AUTH_HERO_DESKTOP_SRC_FALLBACK = "/login-hero-desktop-2x.jpg";
export const AUTH_HERO_MOBILE_SRC_FALLBACK = "/login-hero-mobile.jpg";

type AuthShellProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

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
        "font-sans relative isolate flex min-h-dvh w-full flex-col overflow-x-hidden",
        "bg-[#b4d2f4]",
        "px-4 py-5 sm:px-5 sm:py-6",
        "lg:h-dvh lg:max-h-dvh lg:overflow-hidden lg:p-0",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <picture className="hidden lg:contents">
          <source
            media="(min-width: 1920px)"
            srcSet="/login-hero-desktop-3x.webp"
            type="image/webp"
          />
          <source
            media="(min-width: 1024px)"
            srcSet="/login-hero-desktop-2x.webp"
            type="image/webp"
          />
          <source
            media="(min-width: 1024px)"
            srcSet="/login-hero-desktop-2x.jpg"
            type="image/jpeg"
          />
          <img
            src={AUTH_HERO_DESKTOP_SRC_FALLBACK}
            alt=""
            className="hidden h-full w-full select-none object-cover object-[8%_top] lg:block"
            decoding="async"
            fetchPriority="high"
          />
        </picture>

        <picture className="contents lg:hidden">
          <source srcSet="/login-hero-mobile.webp" type="image/webp" />
          <img
            src={AUTH_HERO_MOBILE_SRC_FALLBACK}
            alt=""
            className="h-full w-full select-none object-cover object-[left_top]"
            decoding="async"
            fetchPriority="high"
          />
        </picture>
      </div>

      {/* Modal: posição fixa à esquerda do centro (área livre da arte) */}
      <div
        className={cn(
          "relative z-10 flex flex-1 items-center justify-center",
          "max-lg:mt-auto max-lg:pb-2",
          "lg:absolute lg:inset-y-0 lg:left-[40%] lg:flex lg:w-[25rem] lg:max-w-[calc(100%-40%-1rem)] lg:items-center lg:justify-start",
        )}
      >
        <div
          className={cn(
            "w-full max-w-[min(100%,22.5rem)] animate-[fadeIn_0.5s_ease-out] sm:max-w-[27rem]",
            "lg:max-w-[25rem]",
            contentClassName,
          )}
        >
          {children}
        </div>
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
