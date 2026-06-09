"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AppAlertVariant = "info" | "error" | "warning" | "success";

export function AppAlert({
  open,
  onOpenChange,
  title,
  description,
  variant = "info",
  confirmText = "OK",
  onConfirm,
  cancelText,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string | null;
  variant?: AppAlertVariant;
  confirmText?: string;
  onConfirm?: () => void;
  cancelText?: string;
}) {
  const confirmClass =
    variant === "error"
      ? "bg-red-600 hover:bg-red-700 text-white"
      : variant === "warning"
        ? "bg-orange-600 hover:bg-orange-700 text-white"
        : variant === "success"
          ? "bg-emerald-600 hover:bg-emerald-700 text-white"
          : "bg-primary hover:bg-primary/90 text-primary-foreground";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="font-sans max-w-[95vw] sm:max-w-md border-border bg-card text-card-foreground"
      >
        <DialogHeader>
          <DialogTitle className="font-sans text-foreground">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="font-sans text-muted-foreground">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <DialogFooter className="gap-2">
          {cancelText ? (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => onOpenChange(false)}
            >
              {cancelText}
            </Button>
          ) : null}
          <Button
            type="button"
            className={cn("h-11", confirmClass)}
            onClick={() => {
              onConfirm?.();
              onOpenChange(false);
            }}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
