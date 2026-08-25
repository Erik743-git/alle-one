"use client";

import { Suspense, useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Clock,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Phone,
  Send,
} from "lucide-react";
import { getDefaultAppRoute } from "@/lib/access-control";
import { AlleOneTitle } from "@/components/brand/alle-one-title";
import { AuthShell, AuthShellFallback } from "@/components/auth/auth-shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FlipCheckbox } from "@/components/ui/flip-checkbox";
import {
  clearDeviceTrustToken,
  readDeviceTrustToken,
  syncDeviceTrustFromResponse,
} from "@/lib/device-trust";
import { setSession, type AuthUser } from "@/lib/session";
import { API_URL, getBrowserApiBase } from "@/lib/env";
import { useAuth } from "@/lib/use-auth";
import {
  fetchOAuthProviders,
  getCachedOAuthProviders,
} from "@/lib/oauth-providers";
import {
  GoogleIcon,
  MicrosoftIcon,
} from "@/components/auth/oauth-provider-icons";

type LoginResponse = {
  message: string;
  accessToken?: string;
  deviceTrustToken?: string;
  user: AuthUser;
};

type ErrorResponse = {
  message?: string | string[];
  error?: string;
  statusCode?: number;
};

const SUPPORT_EMAIL = "contato@alletecnologia.com";

const LOGIN_CONNECTION_ERROR =
  "Não foi possível conectar ao sistema. Tente novamente em instantes ou entre em contato com um administrador.";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_not_registered:
    "Este e-mail não está cadastrado no portal. Peça acesso a um administrador.",
  oauth_not_verified:
    "O provedor não confirmou o e-mail. Tente outra conta ou use senha.",
  oauth_inactive: "Usuário inativo. Entre em contato com um administrador.",
  oauth_provider_mismatch:
    "Esta conta Google/Microsoft não está vinculada ao seu usuário.",
  oauth_cancelled: "Login social cancelado.",
  oauth_invalid_state: "Sessão expirada. Tente entrar novamente.",
  oauth_failed: "Não foi possível concluir o login social. Tente novamente.",
  oauth_2fa_required: "Confirme o código 2FA para concluir o login social.",
  oauth_2fa_expired:
    "Sessão do login social expirou. Entre novamente com Google ou Microsoft.",
  oauth_microsoft_secret:
    "Configuração Microsoft inválida. No Azure, copie o Valor do segredo do cliente (não o ID do segredo) para MICROSOFT_OAUTH_CLIENT_SECRET.",
  oauth_microsoft_profile:
    "Não foi possível obter o e-mail da conta Microsoft. Tente outra conta ou use senha.",
};

const SESSION_REASON_MESSAGES: Record<string, string> = {
  expired: "Sessão expirada. Faça login novamente.",
  idle: "Sessão encerrada por inatividade. Faça login novamente.",
};

function buildOAuthUrl(provider: "google" | "microsoft") {
  // Mesma origem (rewrite Next → API): cookie de state e callback ficam alinhados.
  if (typeof window !== "undefined") {
    const url = new URL(`${window.location.origin}/auth/${provider}`);
    const trust = readDeviceTrustToken();
    if (trust) {
      url.searchParams.set("deviceTrustToken", trust);
    }
    return url.toString();
  }
  const base = getBrowserApiBase();
  const root = base || API_URL.replace(/\/$/, "");
  return `${root}/auth/${provider}`;
}

function startOAuth(provider: "google" | "microsoft") {
  window.location.href = buildOAuthUrl(provider);
}

function authApiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (typeof window !== "undefined") {
    // Rewrite Next `/auth/*` → API: cookie e origem alinhados no browser.
    return `${window.location.origin}${normalized}`;
  }
  const base = getBrowserApiBase() || API_URL.replace(/\/$/, "");
  return `${base}${normalized}`;
}

function authMeUrl(): string {
  return authApiUrl("/auth/me");
}

function LoginPageContent() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [requires2fa, setRequires2fa] = useState(false);
  const [oauth2faPending, setOauth2faPending] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [trustDays, setTrustDays] = useState(14);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [supportForm, setSupportForm] = useState({
    nome: "",
    empresa: "",
    email: "",
    mensagem: "",
  });
  const [supportSending, setSupportSending] = useState(false);
  const [supportSent, setSupportSent] = useState(false);
  const [supportError, setSupportError] = useState("");

  const router = useRouter();
  const searchParams = useSearchParams();
  const { loading: authLoading, establishSession } = useAuth();
  // Estado inicial idêntico no SSR e no cliente (sem sessionStorage no useState).
  const [oauthProviders, setOauthProviders] = useState({
    google: false,
    microsoft: false,
  });
  const [oauthProvidersLoading, setOauthProvidersLoading] = useState(true);
  // Dialog Radix gera IDs diferentes no SSR vs cliente — monta só no client.
  const [supportDialogReady, setSupportDialogReady] = useState(false);

  useEffect(() => {
    setSupportDialogReady(true);
  }, []);

  useEffect(() => {
    const oauthError = searchParams.get("error");
    const sessionReason = searchParams.get("reason");
    if (oauthError === "oauth_2fa_required") {
      setOauth2faPending(true);
      setRequires2fa(true);
      setTotpCode("");
      setErro("");
      router.replace("/login", { scroll: false });
      return;
    }
    if (oauthError) {
      setErro(
        OAUTH_ERROR_MESSAGES[oauthError] ?? OAUTH_ERROR_MESSAGES.oauth_failed,
      );
      router.replace("/login", { scroll: false });
      return;
    }
    if (sessionReason && SESSION_REASON_MESSAGES[sessionReason]) {
      setErro(SESSION_REASON_MESSAGES[sessionReason]);
      router.replace("/login", { scroll: false });
    }
  }, [searchParams, router]);

  useEffect(() => {
    let cancelled = false;

    async function loadOAuthProviders() {
      const cached = getCachedOAuthProviders();
      if (!cancelled && cached) {
        setOauthProviders(cached);
        setOauthProvidersLoading(false);
      }

      try {
        const status = await fetchOAuthProviders({ retries: 4 });
        if (!cancelled) {
          setOauthProviders(status);
        }
      } catch {
        const fallback = getCachedOAuthProviders();
        if (!cancelled && fallback) {
          setOauthProviders(fallback);
        }
      } finally {
        if (!cancelled) {
          setOauthProvidersLoading(false);
        }
      }
    }

    void loadOAuthProviders();

    const onPageShow = () => {
      void loadOAuthProviders();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void loadOAuthProviders();
      }
    });

    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(authMeUrl(), {
          credentials: "include",
        });
        if (!cancelled && res.ok) {
          const data = (await res.json()) as LoginResponse;
          if (data?.user) {
            establishSession(data.user);
            router.replace(
              data.user.firstAccess ? "/primeiro-acesso" : getDefaultAppRoute(),
            );
          }
        }
      } catch {
        /* sem sessão — permanece no login */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, establishSession, router]);

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro("");

    if (oauth2faPending) {
      if (!totpCode.trim()) {
        setErro("Informe o código 2FA do aplicativo.");
        return;
      }
      try {
        setCarregando(true);
        const response = await fetch(
          authApiUrl("/auth/oauth/complete-2fa"),
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code: totpCode.trim(),
              ...(rememberDevice ? { rememberDevice: true } : {}),
            }),
          },
        );
        const data = (await response.json()) as LoginResponse | ErrorResponse;
        if (!response.ok) {
          const mensagem = Array.isArray(data.message)
            ? data.message[0]
            : data.message;
          setErro(
            mensagem === "oauth_2fa_expired"
              ? OAUTH_ERROR_MESSAGES.oauth_2fa_expired
              : mensagem || "Código 2FA inválido.",
          );
          if (mensagem === "oauth_2fa_expired") {
            setOauth2faPending(false);
            setRequires2fa(false);
          }
          return;
        }
        const loginData = data as LoginResponse;
        syncDeviceTrustFromResponse(loginData.deviceTrustToken);
        setSession(undefined, loginData.user);
        establishSession(loginData.user);
        let user: AuthUser = loginData.user;
        try {
          const meRes = await fetch(authApiUrl("/auth/me"), {
            credentials: "include",
          });
          if (meRes.ok) {
            const meData = (await meRes.json()) as LoginResponse;
            syncDeviceTrustFromResponse(meData.deviceTrustToken);
            if (meData?.user) {
              user = meData.user;
              establishSession(user);
            }
          }
        } catch {
          /* perfil do login já basta para seguir */
        }
        if (user.firstAccess) {
          router.push("/primeiro-acesso");
          return;
        }
        router.push(getDefaultAppRoute());
      } catch {
        setErro(LOGIN_CONNECTION_ERROR);
      } finally {
        setCarregando(false);
      }
      return;
    }

    if (!email.trim() || !senha.trim()) {
      setErro("Preencha e-mail e senha.");
      return;
    }

    if (requires2fa && !totpCode.trim()) {
      setErro("Informe o código 2FA do aplicativo.");
      return;
    }

    try {
      setCarregando(true);

      const deviceTrustToken = readDeviceTrustToken();
      const response = await fetch(authApiUrl("/auth/login"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(deviceTrustToken
            ? { "X-Alleone-Device-Trust": deviceTrustToken }
            : {}),
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: senha,
          ...(totpCode.trim() ? { totpCode: totpCode.trim() } : {}),
          ...(totpCode.trim() && rememberDevice ? { rememberDevice: true } : {}),
          ...(deviceTrustToken ? { deviceTrustToken } : {}),
        }),
      });

      const data = (await response.json()) as LoginResponse | ErrorResponse & {
        requires2fa?: boolean;
        trustDays?: number;
      };

      if (!response.ok) {
        const mensagem =
          Array.isArray(data.message) ? data.message[0] : data.message;
        if (
          mensagem === "2FA_REQUIRED" ||
          (data as { requires2fa?: boolean }).requires2fa
        ) {
          if (deviceTrustToken) {
            clearDeviceTrustToken();
          }
          setRequires2fa(true);
          setRememberDevice(true);
          setTotpCode("");
          const days = (data as { trustDays?: number }).trustDays;
          if (typeof days === "number" && days > 0) setTrustDays(days);
          setErro("");
          return;
        }

        setErro(mensagem || "Não foi possível realizar o login.");
        return;
      }

      const loginData = data as LoginResponse;
      syncDeviceTrustFromResponse(loginData.deviceTrustToken);

      setSession(undefined, loginData.user);
      establishSession(loginData.user);

      let user: AuthUser = loginData.user;
      try {
        const meRes = await fetch(authApiUrl("/auth/me"), {
          credentials: "include",
        });
        if (meRes.ok) {
          const meData = (await meRes.json()) as LoginResponse;
          syncDeviceTrustFromResponse(meData.deviceTrustToken);
          if (meData?.user) {
            user = meData.user;
            establishSession(user);
          }
        }
      } catch {
        /* perfil do login já basta para seguir */
      }

      if (user.firstAccess) {
        router.push("/primeiro-acesso");
        return;
      }

      router.push(getDefaultAppRoute());
    } catch {
      setErro(LOGIN_CONNECTION_ERROR);
    } finally {
      setCarregando(false);
    }
  }

  function backToCredentials() {
    setRequires2fa(false);
    setOauth2faPending(false);
    setTotpCode("");
    setRememberDevice(false);
    setErro("");
  }

  async function handleSupportSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (supportSending) return;

    setSupportError("");
    setSupportSent(false);
    setSupportSending(true);

    try {
      const response = await fetch(authApiUrl("/auth/suporte"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: supportForm.nome.trim(),
          empresa: supportForm.empresa.trim(),
          email: supportForm.email.trim(),
          mensagem: supportForm.mensagem.trim(),
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { message?: string | string[] }
        | null;

      if (!response.ok) {
        const msg = Array.isArray(data?.message)
          ? data.message.join(", ")
          : typeof data?.message === "string"
            ? data.message
            : "Não foi possível enviar a mensagem. Tente novamente.";
        setSupportError(msg);
        return;
      }

      setSupportSent(true);
      setSupportForm({ nome: "", empresa: "", email: "", mensagem: "" });
    } catch {
      setSupportError(
        "Falha de conexão ao enviar. Verifique a internet e tente de novo.",
      );
    } finally {
      setSupportSending(false);
    }
  }

  return (
    <AuthShell>
        <Card className="gap-3 rounded-[20px] border border-white/10 bg-[#08182f]/92 py-0 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <CardHeader className="space-y-4 px-4 pb-1 pt-4 sm:px-6 sm:pt-5">
            <div className="relative space-y-1.5 px-9 text-center sm:px-10">
              <a
                href="https://alletecnologia.com"
                target="_blank"
                rel="noreferrer"
                title="Ir para Alle Tecnologia.com"
                className="absolute right-0 top-0 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-slate-300 transition hover:bg-white/10 hover:text-white sm:h-9 sm:w-9"
              >
                <ArrowUpRight size={18} />
              </a>

              <AlleOneTitle className="text-[1.6rem] sm:text-[1.95rem] lg:text-[2.15rem]" />

              <p className="font-sans text-sm font-medium text-slate-300">
                {requires2fa
                  ? "Confirme o código do autenticador"
                  : "Acesse o portal da sua empresa"}
              </p>
            </div>
          </CardHeader>

          <CardContent className="px-4 pb-5 pt-1 sm:px-6">
            <form onSubmit={handleLogin} className="space-y-4">
              {requires2fa ? (
                <>
                  <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#020b1b]/70 px-3 py-2.5">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#12b5d9]/15 text-[#12b5d9]">
                      <Lock size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">
                        {oauth2faPending
                          ? "Login social"
                          : email.trim().toLowerCase()}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {oauth2faPending
                          ? "Identidade confirmada · falta o 2FA"
                          : "Senha validada · falta o 2FA"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={backToCredentials}
                      disabled={carregando}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:bg-white/5 hover:text-white"
                    >
                      <ArrowLeft size={12} />
                      Voltar
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="font-sans text-sm font-bold text-slate-200">
                      Código 2FA
                    </label>
                    <Input
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value)}
                      placeholder="000000"
                      disabled={carregando}
                      autoFocus
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      maxLength={8}
                      className="font-sans h-11 rounded-xl border-white/15 bg-[#020b1b] text-center text-lg tracking-[0.35em] text-white placeholder:tracking-[0.35em] placeholder:text-slate-500"
                    />
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-[#020b1b]/60 px-3.5 py-2.5 transition hover:border-[#12b5d9]/40 hover:bg-[#020b1b]/80">
                      <FlipCheckbox
                        checked={rememberDevice}
                        onChange={(e) => setRememberDevice(e.target.checked)}
                        disabled={carregando}
                        aria-label={`Não pedir código neste dispositivo por ${trustDays} dias`}
                        className="
                          [&_[data-face]]:border-white/30
                          [&_[data-face]]:bg-[#061525]
                          [&_[data-face]]:shadow-none
                          [&_[data-empty]]:bg-[#061525]
                          [&_[data-empty]]:shadow-none
                          [&_[data-check]]:border-transparent
                          [&_[data-check]]:bg-[#12b5d9]
                          [&_[data-check]]:text-[#04101f]
                          [&_[data-check]]:shadow-none
                          [&:has(input:checked)_[data-face]]:border-[#12b5d9]
                        "
                      />
                      <span className="font-sans text-xs leading-snug text-slate-300 sm:text-[13px]">
                        Não pedir código neste dispositivo por {trustDays} dias
                      </span>
                    </label>
                  </div>

                  {erro ? (
                    <div className="alle-alert-error rounded-xl px-3 py-2 text-sm">
                      {erro}
                    </div>
                  ) : null}

                  <Button
                    type="submit"
                    disabled={carregando}
                    className="font-sans h-11 w-full rounded-xl bg-[#12b5d9] text-sm font-bold text-white transition hover:bg-[#0ea5c6]"
                  >
                    {carregando ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verificando...
                      </>
                    ) : (
                      "Confirmar e entrar"
                    )}
                  </Button>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="font-sans text-sm font-bold text-slate-200">
                      E-mail
                    </label>

                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu.email@empresa.com"
                      disabled={carregando}
                      className="font-sans h-11 rounded-xl border-white/15 bg-[#020b1b] text-sm text-white placeholder:text-slate-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <label className="font-sans text-sm font-bold text-slate-200">
                        Senha
                      </label>
                      <Link
                        href="/esqueci-senha"
                        className="font-sans text-xs font-semibold text-slate-400 transition hover:text-white"
                      >
                        Esqueci a senha
                      </Link>
                    </div>

                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={senha}
                        onChange={(e) => setSenha(e.target.value)}
                        placeholder="Digite sua senha"
                        disabled={carregando}
                        className="font-sans h-11 rounded-xl border-white/15 bg-[#020b1b] pr-12 text-sm text-white placeholder:text-slate-500"
                      />

                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        disabled={carregando}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-white"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  {erro ? (
                    <div className="alle-alert-error rounded-xl px-3 py-2 text-sm">
                      {erro}
                    </div>
                  ) : null}

                  <Button
                    type="submit"
                    disabled={carregando}
                    className="font-sans h-11 w-full rounded-xl bg-[#12b5d9] text-sm font-bold text-white transition hover:bg-[#0ea5c6]"
                  >
                    {carregando ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Entrando...
                      </>
                    ) : (
                      "Entrar"
                    )}
                  </Button>

                  {oauthProvidersLoading ? (
                    <div className="space-y-3 pt-1" aria-hidden>
                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-white/10" />
                        <span className="text-xs font-medium text-slate-500">
                          Carregando…
                        </span>
                        <div className="h-px flex-1 bg-white/10" />
                      </div>
                      <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
                        <div className="h-11 animate-pulse rounded-xl bg-white/5" />
                        <div className="h-11 animate-pulse rounded-xl bg-white/5" />
                      </div>
                    </div>
                  ) : null}

                  {!oauthProvidersLoading &&
                  (oauthProviders.google || oauthProviders.microsoft) ? (
                    <div className="space-y-2.5 pt-1">
                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-white/10" />
                        <span className="text-xs font-medium text-slate-400">
                          ou
                        </span>
                        <div className="h-px flex-1 bg-white/10" />
                      </div>

                      <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
                        {oauthProviders.google ? (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={carregando}
                            onClick={() => {
                              startOAuth("google");
                            }}
                            className="font-sans h-11 gap-2 rounded-xl border-white/15 bg-[#020b1b] text-sm text-white hover:bg-white/5"
                          >
                            <GoogleIcon className="h-5 w-5 shrink-0" />
                            Google
                          </Button>
                        ) : null}
                        {oauthProviders.microsoft ? (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={carregando}
                            onClick={() => {
                              startOAuth("microsoft");
                            }}
                            className="font-sans h-11 gap-2 rounded-xl border-white/15 bg-[#020b1b] text-sm text-white hover:bg-white/5"
                          >
                            <MicrosoftIcon className="h-5 w-5 shrink-0" />
                            Microsoft
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </form>

            {supportDialogReady ? (
              <Dialog>
                <p className="mt-4 text-center text-xs text-slate-400 sm:text-sm">
                  Precisa de ajuda?{" "}
                  <DialogTrigger asChild>
                    <button
                      type="button"
                      className="font-bold text-[#12b5d9] transition hover:text-[#5fd5ee]"
                    >
                      Fale com o suporte
                    </button>
                  </DialogTrigger>
                </p>

                <DialogContent
                  className="
                  font-sans gap-0
                  max-h-[min(86vh,640px)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] overflow-hidden
                  border border-white/10 bg-[#08182f] p-0 text-white
                  shadow-[0_24px_90px_rgba(0,0,0,0.48)]
                  duration-300 ease-out
                  data-open:fade-in-0 data-open:zoom-in-95 data-open:slide-in-from-bottom-3
                  data-closed:fade-out-0 data-closed:zoom-out-95 data-closed:slide-out-to-bottom-2
                  sm:max-w-[720px]
                "
                >
                <div className="shrink-0 border-b border-white/10 px-4 py-4 sm:px-5">
                  <DialogHeader className="space-y-2.5 text-left">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#12b5d9]/15 text-[#12b5d9]">
                      <Mail size={18} />
                    </div>

                    <div className="space-y-1">
                      <DialogTitle className="font-sans text-lg font-extrabold text-white sm:text-xl">
                        Fale com o suporte
                      </DialogTitle>

                      <DialogDescription className="font-sans text-sm font-medium text-slate-300">
                        Sua mensagem abre um pré-ticket na equipe Alle Tecnologia.
                      </DialogDescription>
                    </div>
                  </DialogHeader>
                </div>

                <div className="grid min-h-0 max-h-[min(68vh,500px)] overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
                  <form
                    onSubmit={handleSupportSubmit}
                    className="flex min-h-0 min-w-0 flex-col"
                  >
                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden p-4 sm:p-5">
                    <div className="space-y-2">
                      <Label className="font-sans text-sm font-bold text-slate-200">
                        Nome
                      </Label>
                      <Input
                        value={supportForm.nome}
                        onChange={(e) =>
                        setSupportForm((current) => ({
                          ...current,
                          nome: e.target.value,
                        }))
                        }
                        placeholder="Nome"
                        required
                        minLength={2}
                        className="font-sans h-10 rounded-xl border-white/15 bg-[#020b1b] text-sm text-white placeholder:text-slate-500"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="font-sans text-sm font-bold text-slate-200">
                        Empresa
                      </Label>
                      <Input
                        value={supportForm.empresa}
                        onChange={(e) =>
                          setSupportForm((current) => ({
                            ...current,
                            empresa: e.target.value,
                          }))
                        }
                        placeholder="Empresa"
                        required
                        minLength={2}
                        className="font-sans h-10 rounded-xl border-white/15 bg-[#020b1b] text-sm text-white placeholder:text-slate-500"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="font-sans text-sm font-bold text-slate-200">
                        E-mail
                      </Label>
                      <Input
                        type="email"
                        value={supportForm.email}
                        onChange={(e) =>
                          setSupportForm((current) => ({
                            ...current,
                            email: e.target.value,
                          }))
                        }
                        placeholder="seu.email@empresa.com"
                        required
                        className="font-sans h-10 rounded-xl border-white/15 bg-[#020b1b] text-sm text-white placeholder:text-slate-500"
                      />
                    </div>

                    <div className="min-w-0 space-y-2">
                      <Label className="font-sans text-sm font-bold text-slate-200">
                        Mensagem
                      </Label>
                      <Textarea
                        value={supportForm.mensagem}
                        onChange={(e) => {
                          const el = e.currentTarget;
                          setSupportForm((current) => ({
                            ...current,
                            mensagem: el.value,
                          }));
                          el.style.height = "auto";
                          el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
                        }}
                        placeholder="Como podemos ajudar?"
                        required
                        minLength={10}
                        rows={3}
                        className="font-sans h-24 max-h-28 w-full min-w-0 max-w-full resize-none overflow-x-hidden overflow-y-auto break-all rounded-xl border-white/15 bg-[#020b1b] text-sm text-white placeholder:text-slate-500 [field-sizing:fixed] [overflow-wrap:anywhere]"
                      />
                    </div>
                    </div>

                    <div className="shrink-0 border-t border-white/10 bg-[#08182f] p-4 sm:px-5 sm:pb-5 sm:pt-3">
                      {supportError ? (
                        <p className="mb-3 text-center text-xs font-medium text-red-300 sm:text-sm">
                          {supportError}
                        </p>
                      ) : null}
                      {supportSent ? (
                        <p className="mb-3 text-center text-xs font-medium text-emerald-300 sm:text-sm">
                          Mensagem enviada. Em breve a equipe abrirá um pré-ticket.
                        </p>
                      ) : null}
                      <Button
                        type="submit"
                        disabled={supportSending}
                        className="font-sans h-10 w-full rounded-xl bg-[#12b5d9] text-sm font-bold text-white hover:bg-[#0ea5c6] disabled:opacity-60"
                      >
                        {supportSending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="mr-2 h-4 w-4" />
                        )}
                        {supportSending ? "Enviando…" : "Fale conosco!"}
                      </Button>
                    </div>
                  </form>

                  <aside className="min-w-0 overflow-y-auto border-t border-white/10 bg-[#020b1b]/50 p-4 sm:p-5 md:border-l md:border-t-0">
                    <section className="space-y-4">
                      <h2 className="font-sans text-base font-extrabold text-[#12b5d9]">
                        Contato
                      </h2>

                      <div className="space-y-5 text-sm text-slate-300">
                        <div className="grid grid-cols-[24px_1fr] gap-4">
                          <MapPin className="mt-0.5 h-5 w-5 text-[#12b5d9]" />
                          <p>
                            <strong className="text-white">Localizacao:</strong>{" "}
                            Rua Henrique Mayer 152, 2o Andar, Joinville - SC.
                          </p>
                        </div>

                        <div className="grid grid-cols-[24px_1fr] gap-4">
                          <Phone className="mt-0.5 h-5 w-5 text-[#12b5d9]" />
                          <p>
                            <strong className="text-white">Telefone:</strong>{" "}
                            <a
                              href="tel:+5547991705609"
                              className="transition hover:text-[#5fd5ee]"
                            >
                              (47) 99170-5609
                            </a>
                          </p>
                        </div>

                        <div className="grid grid-cols-[24px_1fr] gap-4">
                          <Mail className="mt-0.5 h-5 w-5 text-[#12b5d9]" />
                          <p>
                            <strong className="text-white">Email:</strong>{" "}
                            <a
                              href={`mailto:${SUPPORT_EMAIL}`}
                              className="transition hover:text-[#5fd5ee]"
                            >
                              {SUPPORT_EMAIL}
                            </a>
                          </p>
                        </div>
                      </div>
                    </section>

                    <div className="my-4 h-px bg-white/10" />

                    <section className="space-y-4">
                      <h2 className="font-sans text-base font-extrabold text-[#12b5d9]">
                        Horarios
                      </h2>

                      <div className="grid grid-cols-[24px_1fr] gap-4 text-sm text-slate-300">
                        <Clock className="mt-0.5 h-5 w-5 text-[#12b5d9]" />
                        <p>Segunda - Sexta das 08h ate 18h</p>
                      </div>
                    </section>
                  </aside>
                </div>
              </DialogContent>
            </Dialog>
            ) : (
              <p className="mt-4 text-center text-xs text-slate-400 sm:text-sm">
                Precisa de ajuda?{" "}
                <span className="font-bold text-[#12b5d9]">
                  Fale com o suporte
                </span>
              </p>
            )}
          </CardContent>
        </Card>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthShellFallback />}>
      <LoginPageContent />
    </Suspense>
  );
}
