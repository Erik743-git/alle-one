"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Construction, Loader2 } from "lucide-react";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import AppShell from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { LoadErrorState } from "@/components/ui/load-error-state";
import { useConfirm } from "@/lib/confirm";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  COLUNAS_PERFIL,
  acessoService,
  type CampoPerfil,
  type LinhaAcesso,
} from "@/lib/services/acesso.service";

/**
 * Administração → Acesso por perfil. Cada chave salva na hora; a API passa a
 * responder 403 para o perfil desligado em até 30 s (cache do servidor) e o
 * menu some no próximo carregamento da sessão da pessoa.
 */
function AdminAcessoPageImpl() {
  const [linhas, setLinhas] = useState<LinhaAcesso[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const confirm = useConfirm();

  const carregar = useCallback(async () => {
    try {
      setErro(null);
      setLinhas(await acessoService.listar());
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao carregar.");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function salvar(nova: LinhaAcesso, mensagem: string) {
    setSalvando(nova.chave);
    try {
      setLinhas(await acessoService.salvar(nova));
      notifySuccess(mensagem);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSalvando(null);
    }
  }

  async function trocarConstrucao(linha: LinhaAcesso, ligado: boolean) {
    if (ligado) {
      const ok = await confirm({
        title: `Colocar ${linha.nome} em construção?`,
        description:
          "Só os administradores vão ver o módulo, no menu e na API. Os outros perfis perdem o acesso na hora.",
        confirmText: "Colocar em construção",
      });
      if (!ok) return;
    }
    await salvar(
      { ...linha, emConstrucao: ligado },
      ligado
        ? `${linha.nome} em construção: só admins veem.`
        : `${linha.nome} liberado para os perfis marcados.`,
    );
  }

  async function trocarPerfil(
    linha: LinhaAcesso,
    campo: CampoPerfil,
    rotulo: string,
    ligado: boolean,
  ) {
    await salvar(
      { ...linha, [campo]: ligado },
      `${linha.nome}: ${ligado ? "liberado" : "bloqueado"} para ${rotulo}.`,
    );
  }

  return (
    <ProtectedPage>
      <PermissionGate module="ADMIN">
        <AppShell>
          <div className="space-y-6">
            <div className="space-y-2">
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
              >
                <ArrowLeft size={16} />
                Voltar à administração
              </Link>
              <h1 className="text-3xl font-bold text-foreground">
                Acesso por perfil
              </h1>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Escolha quais perfis veem cada módulo. Desligado, o módulo some
                do menu e a API recusa o acesso. <strong>Em construção</strong>{" "}
                deixa o módulo visível só para os administradores. A permissão
                de cada pessoa (Usuários) continua valendo por baixo.
                Administração não aparece aqui: é sempre só dos admins.
              </p>
            </div>

            {erro ? (
              <LoadErrorState message={erro} onRetry={() => void carregar()} />
            ) : !linhas ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="animate-spin" size={16} /> Carregando…
              </div>
            ) : (
              <>
                {/* Celular: um cartão por módulo, com os perfis empilhados. */}
                <ul className="space-y-3 md:hidden">
                  {linhas.map((linha) => {
                    const ocupado = salvando === linha.chave;
                    return (
                      <li key={linha.chave}>
                        <Card
                          className={
                            linha.emConstrucao ? "bg-amber-500/5" : undefined
                          }
                        >
                          <CardContent className="space-y-3 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-medium">{linha.nome}</p>
                              {linha.emConstrucao ? (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                                  <Construction size={12} aria-hidden />
                                  Só admins
                                </span>
                              ) : null}
                            </div>
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <span>Em construção</span>
                              <Switch
                                checked={linha.emConstrucao}
                                disabled={ocupado}
                                aria-label={`${linha.nome}: em construção`}
                                onCheckedChange={(v) =>
                                  void trocarConstrucao(linha, v)
                                }
                              />
                            </div>
                            {COLUNAS_PERFIL.filter((c) =>
                              linha.perfisPossiveis.includes(c.perfil),
                            ).map((c) => (
                              <div
                                key={c.campo}
                                className="flex items-center justify-between gap-3 text-sm"
                              >
                                <span>{c.rotulo}</span>
                                <Switch
                                  checked={linha[c.campo]}
                                  disabled={ocupado || linha.emConstrucao}
                                  aria-label={`${linha.nome}: ${c.rotulo}`}
                                  onCheckedChange={(v) =>
                                    void trocarPerfil(
                                      linha,
                                      c.campo,
                                      c.rotulo,
                                      v,
                                    )
                                  }
                                />
                              </div>
                            ))}
                          </CardContent>
                        </Card>
                      </li>
                    );
                  })}
                </ul>
                <Card className="hidden md:block">
                  <CardContent className="overflow-x-auto p-0">
                    <table className="w-full min-w-[720px] text-sm">
                      <caption className="sr-only">
                        Módulos do portal por perfil de usuário
                      </caption>
                      <thead>
                        <tr className="border-b border-border text-left text-muted-foreground">
                          <th scope="col" className="px-4 py-3 font-semibold">
                            Módulo
                          </th>
                          <th
                            scope="col"
                            className="px-3 py-3 text-center font-semibold"
                          >
                            Em construção
                          </th>
                          {COLUNAS_PERFIL.map((c) => (
                            <th
                              key={c.campo}
                              scope="col"
                              className="px-3 py-3 text-center font-semibold"
                            >
                              {c.rotulo}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {linhas.map((linha) => {
                          const ocupado = salvando === linha.chave;
                          return (
                            <tr
                              key={linha.chave}
                              className={
                                linha.emConstrucao
                                  ? "border-b border-border bg-amber-500/5 last:border-0"
                                  : "border-b border-border last:border-0"
                              }
                            >
                              <th
                                scope="row"
                                className="px-4 py-3 text-left font-medium"
                              >
                                <span className="inline-flex items-center gap-2">
                                  {linha.nome}
                                  {linha.emConstrucao ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                                      <Construction size={12} aria-hidden />
                                      Só admins
                                    </span>
                                  ) : null}
                                </span>
                              </th>
                              <td className="px-3 py-3 text-center">
                                <Switch
                                  checked={linha.emConstrucao}
                                  disabled={ocupado}
                                  aria-label={`${linha.nome}: em construção`}
                                  onCheckedChange={(v) =>
                                    void trocarConstrucao(linha, v)
                                  }
                                />
                              </td>
                              {COLUNAS_PERFIL.map((c) => {
                                const possivel = linha.perfisPossiveis.includes(
                                  c.perfil,
                                );
                                if (!possivel) {
                                  return (
                                    <td
                                      key={c.campo}
                                      className="px-3 py-3 text-center text-muted-foreground"
                                      title="Este módulo não pode ser liberado para esse perfil."
                                    >
                                      <span aria-hidden>—</span>
                                      <span className="sr-only">
                                        Não disponível para {c.rotulo}
                                      </span>
                                    </td>
                                  );
                                }
                                return (
                                  <td
                                    key={c.campo}
                                    className="px-3 py-3 text-center"
                                  >
                                    <Switch
                                      checked={linha[c.campo]}
                                      disabled={ocupado || linha.emConstrucao}
                                      aria-label={`${linha.nome}: ${c.rotulo}`}
                                      onCheckedChange={(v) =>
                                        void trocarPerfil(
                                          linha,
                                          c.campo,
                                          c.rotulo,
                                          v,
                                        )
                                      }
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </>
            )}
            <p className="text-xs text-muted-foreground">
              “—” marca perfil que o módulo não aceita: telas feitas só para a
              equipe CLT (Pré-tickets, Agendas, Mural, Oportunidades) e
              Relatórios, que ainda não tem recorte por empresa para terceiro e
              cliente. Toda alteração vai para a Auditoria.
            </p>
          </div>
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}

export { AdminAcessoPageImpl as PortalPageComponent };
