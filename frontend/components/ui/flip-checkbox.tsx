"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type FlipCheckboxProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
>;

export function FlipCheckbox({ className, ...props }: FlipCheckboxProps) {
  return (
    <span className={cn("relative inline-flex h-5 w-5 shrink-0", className)}>
      <input
        type="checkbox"
        className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        {...props}
      />

      <span
        data-face
        className="pointer-events-none absolute inset-0 rounded-[4px] border-2 border-border bg-card shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border)_70%,transparent)] transition-colors duration-300 peer-hover:border-primary/80 peer-checked:border-primary peer-disabled:opacity-50"
      />

      <span className="pointer-events-none absolute inset-0 transition-transform duration-300 [transform-style:preserve-3d] peer-checked:[transform:rotateY(180deg)]">
        <span
          data-empty
          className="absolute inset-0 rounded-[3px] bg-card [box-shadow:inset_0_0_0_1px_color-mix(in_srgb,var(--border)_85%,transparent)] [backface-visibility:hidden]"
        />
        <span
          data-check
          className="absolute inset-0 flex items-center justify-center rounded-[3px] bg-primary text-primary-foreground shadow-[0_0_0_1px_var(--color-primary),0_2px_6px_color-mix(in_srgb,var(--color-primary)_30%,transparent)] [backface-visibility:hidden] [transform:rotateY(180deg)]"
        >
          <svg viewBox="0 0 16 14" width="14" height="12" aria-hidden="true">
            <path
              d="M2 8.5L6 12.5L14 1.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </span>

      <span className="pointer-events-none absolute -inset-1 rounded-md ring-2 ring-transparent transition peer-focus-visible:ring-[#12b5d9]/50 peer-focus-visible:ring-ring/60" />
    </span>
  );
}
