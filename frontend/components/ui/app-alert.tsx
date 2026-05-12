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
          : "bg-[#12b5d9] hover:bg-[#0ea5c6] text-white";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="font-sans max-w-[95vw] sm:max-w-md border border-white/10 bg-[#08182f] text-white">
        <DialogHeader>
          <DialogTitle className="font-sans text-white">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="font-sans text-slate-400">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <DialogFooter className="gap-2 border-white/10 bg-[#08182f]">
          {cancelText ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 border-white/15 bg-white/5 text-white hover:bg-white/10"
              onClick={() => onOpenChange(false)}
            >
              {cancelText}
            </Button>
          ) : null}
          <Button
            type="button"
            className={`h-11 ${confirmClass}`}
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

