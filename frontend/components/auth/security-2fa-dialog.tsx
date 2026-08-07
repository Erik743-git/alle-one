"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  Lock,
  LockOpen,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/api";
import { totpService } from "@/lib/services/email-inbound.service";
import { useAuth } from "@/lib/use-auth";
import { cn } from "@/lib/utils";

type MeUser = {
  totpEnabled?: boolean;
  totpAdminMustEnable?: boolean;
};

type Security2faDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function Security2faDialog({ open, onOpenChange }: Security2faDialogProps) {
  const { refreshUser } = useAuth();
  const [me, setMe] = useState<MeUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setQr(null);
    setSecret(null);
    setCode("");
    setPassword("");
    setBackupCodes(null);
    setCopiedSecret(false);
    setCopiedCodes(false);
    void apiRequest<{ user: MeUser }>("/auth/me")
      .then((data) => {
        if (!cancelled) setMe(data.user);
      })
      .catch(() => {
        if (!cancelled) setError("Não foi possível carregar o status do 2FA.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function startSetup() {
    setBusy(true);
    setError(null);
    try {
      const r = await totpService.setup();
      setQr(r.qrDataUrl);
      setSecret(r.secret);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao iniciar o 2FA.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!code.trim()) {
      setError("Informe o código de 6 dígitos do aplicativo.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await totpService.confirm(code.trim());
      setBackupCodes(r.backupCodes);
      setQr(null);
      setSecret(null);
      setCode("");
      setMe((prev) => ({ ...prev, totpEnabled: true }));
      await refreshUser();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Código inválido.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!password.trim()) {
      setError("Informe a senha da conta para desativar o 2FA.");
      return;
    }
    if (!code.trim()) {
      setError("Informe o código 2FA para desativar.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await totpService.disable(code.trim(), password);
      setCode("");
      setPassword("");
      setBackupCodes(null);
      setMe((prev) => ({ ...prev, totpEnabled: false }));
      await refreshUser();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível desativar.");
    } finally {
      setBusy(false);
    }
  }

  async function copySecret() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopiedSecret(true);
      window.setTimeout(() => setCopiedSecret(false), 1600);
    } catch {
      setError("Não foi possível copiar o secret.");
    }
  }

  async function copyBackupCodes() {
    if (!backupCodes?.length) return;
    try {
      await navigator.clipboard.writeText(backupCodes.join("\n"));
      setCopiedCodes(true);
      window.setTimeout(() => setCopiedCodes(false), 1600);
    } catch {
      setError("Não foi possível copiar os códigos.");
    }
  }

  const enabled = Boolean(me?.totpEnabled);
  const showingBackup = Boolean(backupCodes?.length);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[440px]">
        <DialogHeader className="space-y-0 border-b border-border/80 px-6 pb-5 pt-6 text-left">
          <div className="flex items-center gap-3.5 pr-8">
            <div
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-2xl ring-1",
                enabled
                  ? "bg-emerald-500/15 text-emerald-500 ring-emerald-500/25"
                  : "bg-muted/80 text-muted-foreground ring-border",
              )}
            >
              {enabled ? (
                <Lock className="size-5" strokeWidth={2.25} />
              ) : (
                <LockOpen className="size-5" strokeWidth={2.25} />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-[15px] font-semibold tracking-tight">
                  Autenticação em dois fatores
                </DialogTitle>
                {!loading ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                      enabled
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {enabled ? (
                      <Lock className="size-2.5" strokeWidth={2.5} />
                    ) : (
                      <LockOpen className="size-2.5" strokeWidth={2.5} />
                    )}
                    {enabled ? "Ativo" : "Inativo"}
                  </span>
                ) : null}
              </div>
              <DialogDescription className="text-[13px] leading-relaxed">
                {showingBackup
                  ? "Guarde os códigos abaixo em local seguro antes de fechar."
                  : "Use Google Authenticator, Authy ou app similar no celular."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              Carregando…
            </div>
          ) : (
            <>
              {me?.totpAdminMustEnable && !enabled ? (
                <div className="flex gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-3 text-[13px] leading-snug text-amber-800 dark:text-amber-200">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0" />
                  <p>Contas ADMIN devem ativar o 2FA nesta conta.</p>
                </div>
              ) : null}

              {error ? (
                <div className="rounded-xl border border-destructive/25 bg-destructive/10 px-3.5 py-3 text-[13px] leading-snug text-destructive">
                  {error}
                </div>
              ) : null}

              {showingBackup && backupCodes ? (
                <div className="space-y-3.5">
                  <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-3">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-[13px] font-medium text-emerald-700 dark:text-emerald-300">
                        2FA ativado com sucesso
                      </p>
                      <p className="text-[12px] leading-relaxed text-emerald-800/80 dark:text-emerald-200/70">
                        Cada código de backup só pode ser usado uma vez.
                      </p>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-border bg-muted/30">
                    <div className="flex items-center justify-between gap-2 border-b border-border/80 px-3.5 py-2.5">
                      <div className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
                        <KeyRound className="size-3.5" />
                        Códigos de backup
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 px-2 text-[12px]"
                        onClick={() => void copyBackupCodes()}
                      >
                        {copiedCodes ? (
                          <>
                            <CheckCircle2 className="size-3.5 text-emerald-500" />
                            Copiado
                          </>
                        ) : (
                          <>
                            <Copy className="size-3.5" />
                            Copiar todos
                          </>
                        )}
                      </Button>
                    </div>
                    <ul className="grid grid-cols-2 gap-x-3 gap-y-2.5 p-3.5 font-mono text-[13px] tracking-wide">
                      {backupCodes.map((c) => (
                        <li
                          key={c}
                          className="rounded-lg bg-background/60 px-2.5 py-1.5 text-center tabular-nums"
                        >
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}

              {!enabled && !showingBackup ? (
                !qr ? (
                  <div className="space-y-4">
                    <ol className="space-y-2.5 text-[13px] text-muted-foreground">
                      <li className="flex gap-2.5">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
                          1
                        </span>
                        <span className="leading-snug pt-0.5">
                          Abra o app autenticador no celular
                        </span>
                      </li>
                      <li className="flex gap-2.5">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
                          2
                        </span>
                        <span className="leading-snug pt-0.5">
                          Escaneie o QR e confirme com o código de 6 dígitos
                        </span>
                      </li>
                    </ol>
                    <Button
                      type="button"
                      className="h-10 w-full"
                      disabled={busy}
                      onClick={() => void startSetup()}
                    >
                      {busy ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <Lock className="mr-2 size-4" />
                      )}
                      Ativar 2FA
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-center rounded-2xl border border-border bg-white p-4 dark:bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={qr}
                        alt="QR Code 2FA"
                        className="size-40"
                      />
                    </div>
                    {secret ? (
                      <div className="space-y-1.5">
                        <Label className="text-[12px] text-muted-foreground">
                          Ou digite o secret manualmente
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            readOnly
                            value={secret}
                            className="h-10 font-mono text-xs"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-10 shrink-0"
                            onClick={() => void copySecret()}
                            aria-label="Copiar secret"
                          >
                            {copiedSecret ? (
                              <CheckCircle2 className="size-4 text-emerald-500" />
                            ) : (
                              <Copy className="size-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                    <div className="space-y-1.5">
                      <Label htmlFor="totp-confirm-code">Código do app</Label>
                      <Input
                        id="totp-confirm-code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="000000"
                        maxLength={8}
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className="h-10 tracking-[0.2em]"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void confirm();
                        }}
                      />
                    </div>
                    <Button
                      type="button"
                      className="h-10 w-full"
                      disabled={busy}
                      onClick={() => void confirm()}
                    >
                      {busy ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : null}
                      Confirmar e ativar
                    </Button>
                  </div>
                )
              ) : null}

              {enabled && !showingBackup ? (
                <div className="space-y-4">
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Para desativar, confirme a senha da conta e um código atual
                    do app (ou de backup). Isso evita remoção só com a sessão
                    aberta.
                  </p>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="totp-disable-password">Senha da conta</Label>
                      <Input
                        id="totp-disable-password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="totp-disable-code">Código 2FA</Label>
                      <Input
                        id="totp-disable-code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="000000"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className="h-10 tracking-[0.2em]"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void disable();
                        }}
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    className="h-10 w-full"
                    disabled={busy}
                    onClick={() => void disable()}
                  >
                    {busy ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <LockOpen className="mr-2 size-4" />
                    )}
                    Desativar 2FA
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>

        <DialogFooter className="mx-0 mb-0 rounded-none border-t border-border/80 bg-muted/40 px-6 py-3.5 sm:justify-end">
          <Button
            type="button"
            variant={showingBackup ? "default" : "outline"}
            className="h-9 min-w-[96px]"
            onClick={() => onOpenChange(false)}
          >
            {showingBackup ? "Entendi, fechar" : "Fechar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
