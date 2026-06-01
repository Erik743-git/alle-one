"use client";

import { useSyncExternalStore } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

import {
  dismissNotify,
  getNotifyItems,
  subscribeNotify,
  type NotifyItem,
  type NotifyVariant,
} from "@/lib/notify";
import { cn } from "@/lib/utils";

function variantStyles(variant: NotifyVariant) {
  switch (variant) {
    case "success":
      return "border-emerald-500/40 bg-emerald-950/90 text-emerald-50";
    case "error":
      return "border-rose-500/50 bg-rose-950/95 text-rose-50";
    case "warning":
      return "border-amber-500/45 bg-amber-950/90 text-amber-50";
    default:
      return "border-border bg-card/95 text-card-foreground";
  }
}

function VariantIcon({ variant }: { variant: NotifyVariant }) {
  const className = "size-4 shrink-0 mt-0.5";
  switch (variant) {
    case "success":
      return <CheckCircle2 className={className} />;
    case "error":
      return <AlertTriangle className={className} />;
    case "warning":
      return <AlertTriangle className={className} />;
    default:
      return <Info className={className} />;
  }
}

export function ToastHost() {
  const toasts = useSyncExternalStore(subscribeNotify, getNotifyItems, getNotifyItems);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed right-4 top-4 z-[200] flex w-full max-w-sm flex-col gap-2 sm:right-6 sm:top-6"
      aria-live="polite"
      aria-label="Notificações"
    >
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function ToastCard({ item }: { item: NotifyItem }) {
  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto flex w-full max-w-sm gap-2 rounded-lg border px-3 py-2.5 text-sm shadow-lg backdrop-blur-sm animate-in slide-in-from-right-4 fade-in duration-200",
        variantStyles(item.variant),
      )}
    >
      <VariantIcon variant={item.variant} />
      <p className="flex-1 leading-snug">{item.message}</p>
      <button
        type="button"
        className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
        aria-label="Fechar aviso"
        onClick={() => dismissNotify(item.id)}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
