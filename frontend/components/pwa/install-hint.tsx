"use client";

import { useCallback, useEffect, useState } from "react";
import { Share, Smartphone, X } from "lucide-react";

import { Button } from "@/components/ui/button";

const STORAGE_KEY = "alleone.pwa.installHint.dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isMobileUa(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function PwaInstallHint() {
  const [visible, setVisible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandaloneDisplay()) return;
    if (!isMobileUa()) return;
    if (localStorage.getItem(STORAGE_KEY) === "1") return;

    const showTimer = window.setTimeout(() => setVisible(true), 0);

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => {
      window.clearTimeout(showTimer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  }, [deferredPrompt, dismiss]);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto flex max-w-md flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-lg sm:left-auto"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Smartphone className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold">Instalar Alle One no celular</p>
          {deferredPrompt ? (
            <p className="text-xs text-muted-foreground">
              Toque em Instalar agora para abrir em tela cheia, sem barra de endereco.
            </p>
          ) : isIos() ? (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Share className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Toque em Compartilhar e depois em &quot;Adicionar à Tela de Início&quot;.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Menu do Chrome: &quot;Instalar app&quot; (nao so atalho). Se aparecer URL no topo,
              remova o atalho e instale de novo apos o deploy PWA.
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label="Fechar dica de instalação"
          onClick={dismiss}
        >
          <X className="size-4" />
        </Button>
      </div>
      {deferredPrompt ? (
        <Button type="button" size="sm" className="w-full" onClick={() => void install()}>
          Instalar agora
        </Button>
      ) : (
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={dismiss}>
          Entendi
        </Button>
      )}
    </div>
  );
}
