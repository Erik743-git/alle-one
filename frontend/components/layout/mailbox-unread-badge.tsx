"use client";

import { useEffect, useState } from "react";

import { canAccessCorreio } from "@/lib/access-control";
import { mailboxService } from "@/lib/services/mailbox.service";
import { cn } from "@/lib/utils";

type Props = {
  /** No ícone quando o menu está recolhido. */
  variant?: "collapsed" | "inline";
};

export function MailboxUnreadBadge({ variant = "inline" }: Props) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!canAccessCorreio()) return;
    let cancelled = false;
    void mailboxService
      .unreadCount()
      .then((res) => {
        if (!cancelled) setCount(res.count);
      })
      .catch(() => {
        if (!cancelled) setCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!count) return null;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-rose-600 font-bold text-white",
        variant === "collapsed"
          ? "absolute -right-1 -top-1 min-w-[1rem] px-1 text-[9px] leading-4"
          : "min-w-[1.35rem] px-1.5 text-[10px] leading-5",
      )}
      aria-label={`${count} não lidas`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
