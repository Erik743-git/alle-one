"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { canAccessCorreio, isAdmin } from "@/lib/access-control";
import { mailboxService } from "@/lib/services/mailbox.service";
import { cn } from "@/lib/utils";

/** Badge no header/sidebar quando há alerta TIFLUX_SYNC_STALE não lido. */
export function SyncStaleBadge({
  className,
}: {
  className?: string;
}) {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!isAdmin() || !canAccessCorreio()) return;
    let cancelled = false;
    void mailboxService
      .list()
      .then((items) => {
        if (cancelled) return;
        const hasStale = items.some(
          (item) =>
            item.kind === "TIFLUX_SYNC_STALE" && item.readAt == null,
        );
        setStale(hasStale);
      })
      .catch(() => {
        if (!cancelled) setStale(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!stale) return null;

  return (
    <Link
      href="/correio"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400",
        className,
      )}
      title="Sync TiFlux possivelmente parado — abra o Correio"
    >
      <AlertTriangle className="size-3.5 shrink-0" />
      Sync TiFlux
    </Link>
  );
}
