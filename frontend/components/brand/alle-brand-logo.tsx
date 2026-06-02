"use client";

import Image from "next/image";
import { ALLE_LOGO_DARK_SRC, ALLE_LOGO_LIGHT_SRC } from "@/lib/alle-brand-logos";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
};

/** Logo completa: cinza no tema claro, branca no tema escuro. */
export function AlleBrandLogo({
  className,
  width = 190,
  height = 68,
  priority = false,
}: Props) {
  return (
    <>
      <Image
        src={ALLE_LOGO_LIGHT_SRC}
        alt="Alle Tecnologia"
        width={width}
        height={height}
        priority={priority}
        className={cn("h-auto object-contain dark:hidden", className)}
      />
      <Image
        src={ALLE_LOGO_DARK_SRC}
        alt="Alle Tecnologia"
        width={width}
        height={height}
        priority={priority}
        className={cn("hidden h-auto object-contain dark:block", className)}
      />
    </>
  );
}

/** Telas sempre escuras (login, etc.): só a versão com texto branco. */
export function AlleBrandLogoOnDark({
  className,
  width = 140,
  height = 44,
  priority = false,
}: Props) {
  return (
    <Image
      src={ALLE_LOGO_DARK_SRC}
      alt="Alle Tecnologia"
      width={width}
      height={height}
      priority={priority}
      className={cn("h-auto object-contain", className)}
    />
  );
}
