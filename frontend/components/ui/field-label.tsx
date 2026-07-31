import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Asterisco vermelho padrão para campos obrigatórios. */
export function RequiredMark({ className }: { className?: string }) {
  return (
    <span className={cn("text-destructive", className)} aria-hidden="true">
      {" "}
      *
    </span>
  );
}

type FieldLabelProps = {
  children: ReactNode;
  required?: boolean;
  optional?: boolean;
  className?: string;
  htmlFor?: string;
};

/**
 * Label de formulário padronizado.
 * - Obrigatório: `*` em `text-destructive` (nunca cinza / muted no asterisco)
 * - Opcional: sufixo "(opcional)" em muted
 */
export function FieldLabel({
  children,
  required = false,
  optional = false,
  className,
  htmlFor,
}: FieldLabelProps) {
  return (
    <Label
      htmlFor={htmlFor}
      className={cn(
        "text-xs font-semibold text-muted-foreground",
        className,
      )}
    >
      {children}
      {required ? <RequiredMark /> : null}
      {optional && !required ? (
        <span className="font-normal text-muted-foreground"> (opcional)</span>
      ) : null}
    </Label>
  );
}
