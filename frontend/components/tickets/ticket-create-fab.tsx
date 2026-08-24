"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { canCreateTicket } from "@/lib/access-control";

export function TicketCreateFab() {
  const pathname = usePathname();

  if (!canCreateTicket()) {
    return null;
  }

  if (pathname === "/tickets/new" || pathname.startsWith("/tickets/new/")) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-end p-4 sm:p-6">
      <Button
        asChild
        size="lg"
        className="pointer-events-auto h-14 rounded-full px-6 shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
      >
        <Link href="/tickets/new" aria-label="Abrir novo ticket">
          <Plus className="mr-2 size-5" />
          Novo ticket
        </Link>
      </Button>
    </div>
  );
}
