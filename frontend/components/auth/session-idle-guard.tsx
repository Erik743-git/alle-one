"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/use-auth";
import { endSession } from "@/lib/session";

/** Tempo máximo parado sem interação de UI. */
export const SESSION_IDLE_MS = 60 * 60 * 1000;
/** Aviso antes do logout automático. */
export const SESSION_IDLE_WARN_MS = 5 * 60 * 1000;

const ACTIVITY_THROTTLE_MS = 1_000;
const TICK_MS = 10_000;
const STORAGE_KEY = "alleone.lastActivityAt";

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "wheel",
] as const;

function readLastActivity(): number {
  if (typeof window === "undefined") return Date.now();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  } catch {
    /* ignore */
  }
  return Date.now();
}

function writeLastActivity(ts: number) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, String(ts));
  } catch {
    /* ignore */
  }
}

/**
 * Monitora atividade real de UI (mouse, teclado, scroll…) e encerra a sessão
 * após 1h parado, com aviso 5 min antes.
 */
export function SessionIdleGuard() {
  const { authenticated } = useAuth();
  const [warningOpen, setWarningOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const lastActivityRef = useRef(readLastActivity());
  const lastWriteRef = useRef(0);
  const endingRef = useRef(false);

  const bumpActivity = useCallback(() => {
    if (!authenticated || endingRef.current) return;
    const now = Date.now();
    lastActivityRef.current = now;
    if (now - lastWriteRef.current >= ACTIVITY_THROTTLE_MS) {
      lastWriteRef.current = now;
      writeLastActivity(now);
    }
    setWarningOpen((open) => (open ? false : open));
  }, [authenticated]);

  const staySignedIn = useCallback(() => {
    endingRef.current = false;
    const now = Date.now();
    lastActivityRef.current = now;
    lastWriteRef.current = now;
    writeLastActivity(now);
    setWarningOpen(false);
    setSecondsLeft(0);
  }, []);

  const logoutIdle = useCallback(() => {
    if (endingRef.current) return;
    endingRef.current = true;
    setWarningOpen(false);
    void endSession("idle");
  }, []);

  useEffect(() => {
    if (!authenticated) {
      setWarningOpen(false);
      endingRef.current = false;
      return;
    }

    const now = Date.now();
    if (!window.sessionStorage.getItem(STORAGE_KEY)) {
      writeLastActivity(now);
      lastActivityRef.current = now;
    } else {
      lastActivityRef.current = readLastActivity();
    }

    const onActivity = () => bumpActivity();
    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, onActivity, { capture: true, passive: true });
      document.addEventListener(evt, onActivity, {
        capture: true,
        passive: true,
      });
    }

    const evaluate = () => {
      if (endingRef.current) return;
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= SESSION_IDLE_MS) {
        logoutIdle();
        return;
      }
      const remaining = SESSION_IDLE_MS - elapsed;
      if (remaining <= SESSION_IDLE_WARN_MS) {
        setWarningOpen(true);
        setSecondsLeft(Math.max(1, Math.ceil(remaining / 1000)));
      } else {
        setWarningOpen(false);
      }
    };

    evaluate();
    const tick = window.setInterval(evaluate, TICK_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        evaluate();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(tick);
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, onActivity, true);
        document.removeEventListener(evt, onActivity, true);
      }
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [authenticated, bumpActivity, logoutIdle]);

  useEffect(() => {
    if (!warningOpen || !authenticated) return;
    const id = window.setInterval(() => {
      if (endingRef.current) return;
      const remaining = SESSION_IDLE_MS - (Date.now() - lastActivityRef.current);
      if (remaining <= 0) {
        logoutIdle();
        return;
      }
      setSecondsLeft(Math.max(1, Math.ceil(remaining / 1000)));
    }, 1_000);
    return () => window.clearInterval(id);
  }, [warningOpen, authenticated, logoutIdle]);

  if (!authenticated) return null;

  const minutesLeft = Math.max(1, Math.ceil(secondsLeft / 60));
  const clockLabel =
    secondsLeft > 60
      ? `${minutesLeft} min`
      : `${secondsLeft} s`;

  return (
    <Dialog
      open={warningOpen}
      onOpenChange={(open) => {
        if (!open) staySignedIn();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Sessão prestes a expirar</DialogTitle>
          <DialogDescription>
            Você está há algum tempo sem interagir com o portal. A sessão será
            encerrada em{" "}
            <span className="font-medium text-foreground">{clockLabel}</span>{" "}
            por inatividade.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              endingRef.current = true;
              void endSession("idle");
            }}
          >
            Sair agora
          </Button>
          <Button type="button" onClick={staySignedIn}>
            Continuar conectado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
