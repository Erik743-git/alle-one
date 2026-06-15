"use client";

import { Suspense, useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlleBrandLogoOnDark } from "@/components/brand/alle-brand-logo";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Clock,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Send,
} from "lucide-react";
import { AlleOneTitle } from "@/components/brand/alle-one-title";
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
import { setSession, type AuthUser } from "@/lib/session";
import { API_URL } from "@/lib/env";
import { authService } from "@/lib/services/auth.service";
import { useAuth } from "@/lib/use-auth";
import {
  GoogleIcon,
  MicrosoftIcon,
} from "@/components/auth/oauth-provider-icons";

type LoginResponse = {
  message: string;
  accessToken?: string;
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

const LOGIN_SESSION_ERROR =
  "Não foi possível concluir o login. Tente novamente ou entre em contato com um administrador.";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_email_required:
    "Informe o e-mail cadastrado no portal antes de usar Google ou Microsoft.",
  oauth_not_registered:
    "Este e-mail não está cadastrado no portal. Peça acesso a um administrador.",
  oauth_email_mismatch:
    "A conta Google/Microsoft não corresponde ao e-mail informado. Use a conta correta ou peça acesso a um administrador.",
  oauth_not_verified:
    "O provedor não confirmou o e-mail. Tente outra conta ou use senha.",
  oauth_inactive: "Usuário inativo. Entre em contato com um administrador.",
  oauth_provider_mismatch:
    "Esta conta Google/Microsoft não está vinculada ao seu usuário.",
  oauth_cancelled: "Login social cancelado.",
  oauth_invalid_state: "Sessão expirada. Tente entrar novamente.",
  oauth_failed: "Não foi possível concluir o login social. Tente novamente.",
  oauth_microsoft_secret:
    "Configuração Microsoft inválida. No Azure, copie o Valor do segredo do cliente (não o ID do segredo) para MICROSOFT_OAUTH_CLIENT_SECRET.",
  oauth_microsoft_profile:
    "Não foi possível obter o e-mail da conta Microsoft. Tente outra conta ou use senha.",
};

function buildOAuthUrl(provider: "google" | "microsoft", emailHint: string) {
  const params = new URLSearchParams({ email: emailHint });
  return `${API_URL}/auth/${provider}?${params.toString()}`;
}

function startOAuth(
  provider: "google" | "microsoft",
  emailHint: string,
  setErro: (msg: string) => void,
) {
  const trimmed = emailHint.trim();
  if (!trimmed) {
    setErro(OAUTH_ERROR_MESSAGES.oauth_email_required);
    return;
  }
  window.location.href = buildOAuthUrl(provider, trimmed);
}

function LoginPageContent() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [supportForm, setSupportForm] = useState({
    nome: "",
    empresa: "",
    email: "",
    mensagem: "",
  });

  const router = useRouter();
  const searchParams = useSearchParams();
  const { loading: authLoading, establishSession } = useAuth();
  const [oauthProviders, setOauthProviders] = useState({
    google: false,
    microsoft: false,
  });

  useEffect(() => {
    const oauthError = searchParams.get("error");
    if (oauthError) {
      setErro(OAUTH_ERROR_MESSAGES[oauthError] ?? OAUTH_ERROR_MESSAGES.oauth_failed);
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    void fetch(`${API_URL}/auth/oauth/providers`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { google?: boolean; microsoft?: boolean } | null) => {
        if (!cancelled && data) {
          setOauthProviders({
            google: Boolean(data.google),
            microsoft: Boolean(data.microsoft),
          });
        }
      })
      .catch(() => {
        /* OAuth opcional — ignora falha */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/me`, {
          credentials: "include",
        });
        if (!cancelled && res.ok) {
          const data = (await res.json()) as LoginResponse;
          if (data?.user) {
            establishSession(data.user);
            router.replace(
              data.user.firstAccess ? "/primeiro-acesso" : "/dashboard",
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

    if (!email.trim() || !senha.trim()) {
      setErro("Preencha e-mail e senha.");
      return;
    }

    try {
      setCarregando(true);

      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password: senha,
        }),
      });

      const data = (await response.json()) as LoginResponse | ErrorResponse;

      if (!response.ok) {
        const mensagem =
          Array.isArray(data.message) ? data.message[0] : data.message;

        setErro(mensagem || "Não foi possível realizar o login.");
        return;
      }

      const loginData = data as LoginResponse;

      setSession(undefined, loginData.user);
      establishSession(loginData.user);

      let user: AuthUser = loginData.user;
      try {
        const meData = await authService.me();
        if (meData?.user) {
          user = meData.user;
          establishSession(user);
        }
      } catch {
        setErro(LOGIN_SESSION_ERROR);
        return;
      }

      if (user.firstAccess) {
        router.push("/primeiro-acesso");
        return;
      }

      router.push("/dashboard");
    } catch {
      setErro(LOGIN_CONNECTION_ERROR);
    } finally {
      setCarregando(false);
    }
  }

  function handleSupportSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const body = [
      `Nome: ${supportForm.nome}`,
      `Empresa: ${supportForm.empresa}`,
      `E-mail: ${supportForm.email}`,
      "",
      "Comentario ou mensagem:",
      supportForm.mensagem,
    ].join("\n");

    const mailtoUrl = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      "Solicitacao de suporte - Alle One"
    )}&body=${encodeURIComponent(body)}`;

    window.location.href = mailtoUrl;
  }

  return (
    <main className="font-sans relative flex min-h-screen items-center justify-center overflow-hidden bg-[#020b1b] px-4 py-6 sm:px-6 lg:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#149ddd_0%,#04152d_35%,#020b1b_70%,#010611_100%)]" />
      <div className="absolute left-[-120px] top-[10%] h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl sm:h-64 sm:w-64 lg:h-72 lg:w-72" />
      <div className="absolute right-[-80px] top-[35%] h-52 w-52 rounded-full bg-blue-500/10 blur-3xl sm:h-72 sm:w-72 lg:h-80 lg:w-80" />
      <div className="absolute bottom-[-60px] left-[18%] h-44 w-44 rounded-full bg-sky-500/10 blur-3xl sm:h-64 sm:w-64 lg:h-72 lg:w-72" />

      <div className="relative z-10 w-full max-w-[360px] animate-[fadeIn_0.5s_ease-out] sm:max-w-[400px] lg:max-w-[450px]">
        <Card className="rounded-[20px] border border-white/10 bg-[#08182f]/88 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:rounded-[22px]">
          <CardHeader className="space-y-5 px-5 pb-3 pt-5 sm:space-y-6 sm:px-7 sm:pt-7 lg:space-y-8">
            <div className="relative flex items-center">
              <AlleBrandLogoOnDark
                priority
                className="w-[110px] sm:w-[125px] lg:w-[140px]"
              />

              <a
                href="https://alletecnologia.com"
                target="_blank"
                rel="noreferrer"
                title="Ir para Alle Tecnologia.com"
                className="absolute right-0 flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                <ArrowUpRight size={18} />
              </a>
            </div>

            <div className="space-y-2 text-center">
              <AlleOneTitle />

              <p className="font-sans text-sm font-medium text-slate-300 sm:text-[15px]">
                Acesse o portal da sua empresa
              </p>
            </div>
          </CardHeader>

          <CardContent className="px-5 pb-5 pt-1 sm:px-7 sm:pb-7">
            <form onSubmit={handleLogin} className="space-y-4 sm:space-y-5">
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
                  className="font-sans h-11 rounded-xl border-white/15 bg-[#020b1b] text-sm text-white placeholder:text-slate-500 sm:h-12 sm:text-[15px]"
                />
              </div>

              <div className="space-y-2">
                <label className="font-sans text-sm font-bold text-slate-200">
                  Senha
                </label>

                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="Digite sua senha"
                    disabled={carregando}
                    className="font-sans h-11 rounded-xl border-white/15 bg-[#020b1b] pr-12 text-sm text-white placeholder:text-slate-500 sm:h-12 sm:text-[15px]"
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

              <div className="flex items-center justify-between gap-3 text-xs sm:text-sm">
                <Link
                  href="/primeiro-acesso"
                  className="font-sans font-semibold text-[#12b5d9] transition hover:text-[#5fd5ee]"
                >
                  Primeiro acesso
                </Link>

                <Link
                  href="/esqueci-senha"
                  className="font-sans font-semibold text-slate-300 transition hover:text-white"
                >
                  Esqueci minha senha
                </Link>
              </div>

              <Button
                type="submit"
                disabled={carregando}
                className="font-sans h-11 w-full rounded-xl bg-[#12b5d9] text-sm font-bold text-white transition hover:bg-[#0ea5c6] sm:h-12 sm:text-[15px]"
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

              {oauthProviders.google || oauthProviders.microsoft ? (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-white/10" />
                    <span className="text-xs font-medium text-slate-400">
                      ou continue com
                    </span>
                    <div className="h-px flex-1 bg-white/10" />
                  </div>

                  <p className="text-center text-xs text-slate-400">
                    Só é possível entrar se o e-mail já estiver cadastrado no
                    portal.
                  </p>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {oauthProviders.google ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={carregando}
                        onClick={() => {
                          startOAuth("google", email, setErro);
                        }}
                        className="font-sans h-11 gap-2 rounded-xl border-white/15 bg-[#020b1b] text-sm text-white hover:bg-white/5 sm:h-12"
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
                          startOAuth("microsoft", email, setErro);
                        }}
                        className="font-sans h-11 gap-2 rounded-xl border-white/15 bg-[#020b1b] text-sm text-white hover:bg-white/5 sm:h-12"
                      >
                        <MicrosoftIcon className="h-5 w-5 shrink-0" />
                        Microsoft
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </form>

            <Dialog>
              <p className="mt-5 text-center text-xs text-slate-400 sm:mt-6 sm:text-sm">
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
                  font-sans
                  max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] overflow-hidden
                  border border-white/10 bg-[#08182f] p-0 text-white
                  shadow-[0_24px_90px_rgba(0,0,0,0.48)]
                  sm:max-w-[920px]
                "
              >
                <div className="border-b border-white/10 px-5 py-5 sm:px-6">
                  <DialogHeader className="space-y-3 text-left">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#12b5d9]/15 text-[#12b5d9]">
                      <Mail size={22} />
                    </div>

                    <div className="space-y-1">
                      <DialogTitle className="font-sans text-xl font-extrabold text-white sm:text-2xl">
                        Fale com o suporte
                      </DialogTitle>

                      <DialogDescription className="font-sans text-sm font-medium text-slate-300">
                        Envie sua mensagem para a equipe da Alle Tecnologia.
                      </DialogDescription>
                    </div>
                  </DialogHeader>
                </div>

                <div className="grid max-h-[calc(100vh-10rem)] overflow-y-auto md:grid-cols-[1fr_0.9fr]">
                  <form
                    onSubmit={handleSupportSubmit}
                    className="space-y-4 p-5 sm:p-6"
                  >
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
                        className="font-sans h-11 rounded-xl border-white/15 bg-[#020b1b] text-sm text-white placeholder:text-slate-500 sm:text-[15px]"
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
                        className="font-sans h-11 rounded-xl border-white/15 bg-[#020b1b] text-sm text-white placeholder:text-slate-500 sm:text-[15px]"
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
                        className="font-sans h-11 rounded-xl border-white/15 bg-[#020b1b] text-sm text-white placeholder:text-slate-500 sm:text-[15px]"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="font-sans text-sm font-bold text-slate-200">
                        Mensagem
                      </Label>
                      <Textarea
                        value={supportForm.mensagem}
                        onChange={(e) =>
                          setSupportForm((current) => ({
                            ...current,
                            mensagem: e.target.value,
                          }))
                        }
                        placeholder="Como podemos ajudar?"
                        className="font-sans min-h-32 resize-y rounded-xl border-white/15 bg-[#020b1b] text-sm text-white placeholder:text-slate-500 sm:text-[15px]"
                      />
                    </div>

                    <div className="pt-1">
                      <Button
                        type="submit"
                        className="font-sans h-11 w-full rounded-xl bg-[#12b5d9] text-sm font-bold text-white hover:bg-[#0ea5c6] sm:h-12 sm:text-[15px]"
                      >
                        <Send className="mr-2 h-4 w-4" />
                        Fale conosco!
                      </Button>
                    </div>
                  </form>

                  <aside className="border-t border-white/10 bg-[#020b1b]/50 p-5 sm:p-6 md:border-l md:border-t-0">
                    <section className="space-y-5">
                      <h2 className="font-sans text-lg font-extrabold text-[#12b5d9]">
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

                    <div className="my-6 h-px bg-white/10" />

                    <section className="space-y-5">
                      <h2 className="font-sans text-lg font-extrabold text-[#12b5d9]">
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
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#020b1b]">
          <Loader2 className="h-8 w-8 animate-spin text-[#12b5d9]" />
        </main>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
