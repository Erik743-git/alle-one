"use client";

import { useEffect, useState } from "react";

import { isClient } from "@/lib/access-control";
import { emailInboundService } from "@/lib/services/email-inbound.service";
import { cn } from "@/lib/utils";

const REFRESH_EVENT = "alleone:pre-tickets-refresh";

/** Dispare após listar/abrir/excluir pré-tickets ou no botão Atualizar. */
export function refreshPreTicketsBadge() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(REFRESH_EVENT));
}

type Props = {
  variant?: "collapsed" | "inline";
};

export function PreTicketsBadge({ variant = "inline" }: Props) {
  const [count, setCount] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onRefresh = () => setTick((value) => value + 1);
    window.addEventListener(REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(REFRESH_EVENT, onRefresh);
  }, []);

  useEffect(() => {
    if (isClient()) return;
    let cancelled = false;

    void emailInboundService
      .countPreTickets()
      .then((res) => {
        if (!cancelled) setCount(res.count);
      })
      .catch(() => {
        if (!cancelled) setCount(0);
      });

    return () => {
      cancelled = true;
    };
  }, [tick]);

  // Poll leve enquanto a tela de chamados estiver aberta (e-mail entra sozinho).
  useEffect(() => {
    if (isClient()) return;
    const id = window.setInterval(() => {
      setTick((value) => value + 1);
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  if (!count) return null;

  return (
    <span
      className={cn(
        "pointer-events-none inline-flex shrink-0 items-center justify-center rounded-full bg-rose-600 font-bold text-white",
        variant === "collapsed"
          ? "absolute right-0.5 top-0.5 z-10 h-4 min-w-4 px-1 text-[9px] leading-4"
          : "ml-1.5 min-w-[1.35rem] px-1.5 text-[10px] leading-5",
      )}
      aria-label={`${count} pré-tickets`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
