"use client";

import { useCallback, useEffect, useState } from "react";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import AppShell from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import {
  classificationService,
  type ServiceDeskOption,
} from "@/lib/services/classification.service";
import { companiesService, type Company } from "@/lib/services/companies.service";
import {
  emailInboundService,
  type EmailInboundRoute,
  type EmailInboundSettings,
  type EmailTemplate,
} from "@/lib/services/email-inbound.service";
import { Plus, RefreshCw, Trash2 } from "lucide-react";

type Tab = "geral" | "recebimento" | "envio";

/** Aceita `email@dominio.com` ou o curinga `*@dominio.com`. */
const BLOCKED_SENDER_PATTERN =
  /^(\*@[^@\s]+\.[^@\s]+|[^@\s]+@[^@\s]+\.[^@\s]+)$/;

function parseBlockedSenders(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(/[\n,;]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export default function AdminEmailPage() {
  const [tab, setTab] = useState<Tab>("recebimento");
  const [settings, setSettings] = useState<EmailInboundSettings | null>(null);
  const [blockedDraft, setBlockedDraft] = useState("");
  const [blockedError, setBlockedError] = useState("");
  const [routes, setRoutes] = useState<EmailInboundRoute[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState("");
  const [templateDraft, setTemplateDraft] = useState<{
    name: string;
    subject: string;
    bodyHtml: string;
    bodyText: string;
  } | null>(null);
  const [desks, setDesks] = useState<ServiceDeskOption[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [matchEmail, setMatchEmail] = useState("");
  const [priorityName, setPriorityName] = useState("Baixa");
  const [routeDeskId, setRouteDeskId] = useState("");
  const [routeCompanyId, setRouteCompanyId] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, r, deskList, companyList, templateList] = await Promise.all([
        emailInboundService.getSettings(),
        emailInboundService.listRoutes(),
        classificationService.listDesks().catch(() => [] as ServiceDeskOption[]),
        companiesService.list().catch(() => [] as Company[]),
        emailInboundService.listTemplates().catch(() => [] as EmailTemplate[]),
      ]);
      setSettings(s);
      setRoutes(r);
      setDesks(deskList);
      setCompanies(companyList.filter((c) => c.status && !c.deletedAt));
      setTemplates(templateList);
      setError(null);
      setSelectedTemplateKey((prev) => {
        const next =
          templateList.find((t) => t.key === prev)?.key ??
          templateList[0]?.key ??
          "";
        const current = templateList.find((t) => t.key === next);
        if (current) {
          setTemplateDraft({
            name: current.name,
            subject: current.subject,
            bodyHtml: current.bodyHtml,
            bodyText: current.bodyText,
          });
        }
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar");
    }
  }, []);

  function selectTemplate(key: string) {
    const current = templates.find((t) => t.key === key);
    setSelectedTemplateKey(key);
    if (current) {
      setTemplateDraft({
        name: current.name,
        subject: current.subject,
        bodyHtml: current.bodyHtml,
        bodyText: current.bodyText,
      });
    }
  }

  async function saveTemplate() {
    if (!selectedTemplateKey || !templateDraft) return;
    setBusy(true);
    try {
      const updated = await emailInboundService.updateTemplate(
        selectedTemplateKey,
        templateDraft,
      );
      setTemplates((prev) =>
        prev.map((t) => (t.key === updated.key ? updated : t)),
      );
      setError("Template salvo.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar template");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  const blockedList = parseBlockedSenders(settings?.blockedSenders);

  function addBlockedSender() {
    if (!settings) return;
    const entry = blockedDraft.trim().toLowerCase();
    if (!entry) return;
    if (!BLOCKED_SENDER_PATTERN.test(entry)) {
      setBlockedError("Use o formato email@dominio.com ou *@dominio.com.");
      return;
    }
    const list = parseBlockedSenders(settings.blockedSenders);
    if (list.includes(entry)) {
      setBlockedError("Esse remetente já está na lista.");
      return;
    }
    setSettings({ ...settings, blockedSenders: [...list, entry].join("\n") });
    setBlockedDraft("");
    setBlockedError("");
  }

  function removeBlockedSender(entry: string) {
    if (!settings) return;
    const list = parseBlockedSenders(settings.blockedSenders).filter(
      (item) => item !== entry,
    );
    setSettings({ ...settings, blockedSenders: list.join("\n") });
  }

  async function saveSettings() {
    if (!settings) return;
    setBusy(true);
    try {
      const next = await emailInboundService.updateSettings({
        sharedMailboxAddress: settings.sharedMailboxAddress ?? undefined,
        useAsRequester: settings.useAsRequester,
        graphTenantId: settings.graphTenantId ?? undefined,
        graphClientId: settings.graphClientId ?? undefined,
        enabled: settings.enabled,
        blockedSenders: settings.blockedSenders ?? null,
      });
      setSettings({
        ...next,
        graphConfigured: settings.graphConfigured,
        graphClientSecretConfigured: settings.graphClientSecretConfigured,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setBusy(false);
    }
  }

  async function addRoute() {
    if (!matchEmail.trim()) return;
    setBusy(true);
    try {
      await emailInboundService.createRoute({
        matchEmail: matchEmail.trim(),
        priorityName: priorityName.trim() || undefined,
        deskId: routeDeskId.trim() || undefined,
        companyId: routeCompanyId.trim() || undefined,
        verified: true,
      });
      setMatchEmail("");
      setRouteDeskId("");
      setRouteCompanyId("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao criar");
    } finally {
      setBusy(false);
    }
  }

  async function removeRoute(id: string) {
    setBusy(true);
    try {
      await emailInboundService.deleteRoute(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao excluir");
    } finally {
      setBusy(false);
    }
  }

  async function pollNow() {
    setBusy(true);
    try {
      const r = await emailInboundService.pollNow();
      setError(
        `Busca: lidos ${r.scanned}, novos pré-tickets ${r.created} (duplicados são ignorados).`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na busca");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ProtectedPage>
      <PermissionGate module="ADMIN">
        <AppShell>
          <div className="space-y-6">
            <div>
              <p className="text-sm text-muted-foreground">
                Configurações / Geral / E-mail
              </p>
              <h1 className="text-2xl font-semibold">E-mail</h1>
            </div>

            <div className="flex flex-wrap gap-2 border-b pb-2">
              {(
                [
                  ["geral", "Geral"],
                  ["recebimento", "Recebimento"],
                  ["envio", "Envio"],
                ] as const
              ).map(([id, label]) => (
                <Button
                  key={id}
                  size="sm"
                  variant={tab === id ? "default" : "outline"}
                  onClick={() => setTab(id)}
                >
                  {label}
                </Button>
              ))}
            </div>

            {error ? (
              <p className="text-sm text-amber-600 dark:text-amber-400">{error}</p>
            ) : null}

            {tab === "geral" ? (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Fluxo de E-mail</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-sm font-semibold">
                          1
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium">Receber E-mails</h4>
                          <p className="text-sm text-muted-foreground">
                            Integração com Microsoft Graph lê emails de uma caixa compartilhada
                            (ex: suporte@alletecnologia.com) a cada 1 minuto.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-sm font-semibold">
                          2
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium">Criar Pré-Ticket</h4>
                          <p className="text-sm text-muted-foreground">
                            Cada email novo vira um pré-ticket para triagem. Resposta/edições
                            do mesmo remetente linkam ao pré-ticket existente (sem duplicação).
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 text-sm font-semibold">
                          3
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium">Aplicar Roteamento</h4>
                          <p className="text-sm text-muted-foreground">
                            Regras de roteamento (aba 4) atribuem mesa, cliente e prioridade.
                            Sem regra, abre direto para triagem manual.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 text-sm font-semibold">
                          4
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium">Triagem & Abertura</h4>
                          <p className="text-sm text-muted-foreground">
                            Triador aprova/rejeita pré-tickets. Aprovados viram chamados
                            no Portal (com os dados já extraídos do email).
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Configuração Mínima</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p className="text-muted-foreground">
                      Para começar, siga estes passos:
                    </p>
                    <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                      <li><strong>Aba Recebimento (passo 1-3):</strong> Configure Azure AD e ative recebimento</li>
                      <li><strong>Aba Envio:</strong> Customize templates de notificação (opcional)</li>
                      <li><strong>Aba Recebimento (passo 4):</strong> Crie regras para rotear emails automáticos</li>
                    </ol>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Próximas Iterações</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Separador visual de respostas nas conversas de email</li>
                      <li>Upload de logos/assinaturas para templates</li>
                      <li>Sincronização externa (campo descontinuado)</li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
            ) : null}

            {tab === "envio" ? (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Templates de e-mail</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <p className="text-muted-foreground">
                      Textos enviados ao registrar chamado (criação ou abertura de
                      pré-ticket) e notificações de GMUD. Variáveis:{" "}
                      <code>{"{{ticketNumber}}"}</code>,{" "}
                      <code>{"{{title}}"}</code>,{" "}
                      <code>{"{{requestorName}}"}</code>,{" "}
                      <code>{"{{companyName}}"}</code>,{" "}
                      <code>{"{{openedAt}}"}</code>,{" "}
                      <code>{"{{gmudCode}}"}</code>,{" "}
                      <code>{"{{gmudLink}}"}</code>.
                    </p>
                    <p className="text-muted-foreground">
                      SMTP continua em <code>SMTP_*</code> / <code>MAIL_FROM</code>.
                    </p>
                    <div className="space-y-2">
                      <Label>Template</Label>
                      <SearchableSelectField
                        value={selectedTemplateKey}
                        onChange={selectTemplate}
                        options={templates.map((t) => ({
                          value: t.key,
                          label: `${t.name} (${t.key})`,
                        }))}
                        emptyLabel="Nenhum template"
                      />
                    </div>
                    {templateDraft ? (
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <Label>Nome</Label>
                          <Input
                            value={templateDraft.name}
                            onChange={(e) =>
                              setTemplateDraft({
                                ...templateDraft,
                                name: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Assunto</Label>
                          <Input
                            value={templateDraft.subject}
                            onChange={(e) =>
                              setTemplateDraft({
                                ...templateDraft,
                                subject: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Corpo HTML</Label>
                          <textarea
                            className="min-h-[160px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={templateDraft.bodyHtml}
                            onChange={(e) =>
                              setTemplateDraft({
                                ...templateDraft,
                                bodyHtml: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Corpo texto</Label>
                          <textarea
                            className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={templateDraft.bodyText}
                            onChange={(e) =>
                              setTemplateDraft({
                                ...templateDraft,
                                bodyText: e.target.value,
                              })
                            }
                          />
                        </div>
                        <Button
                          type="button"
                          disabled={busy}
                          onClick={() => void saveTemplate()}
                        >
                          Salvar template
                        </Button>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            ) : null}

            {tab === "recebimento" && settings ? (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>1. Configuração do Azure AD</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p className="text-muted-foreground">
                      Registre um app no Azure AD com acesso à caixa compartilhada:
                    </p>
                    <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                      <li>Crie um App Registration no Azure AD</li>
                      <li>Adicione permissão <code>Mail.Read</code> para o mailbox</li>
                      <li>Gere um Client Secret (copie o valor, aparece uma vez)</li>
                      <li>Defina as 3 variáveis no <code>.env</code> do backend</li>
                    </ol>
                    <div className="bg-muted/50 p-3 rounded-md space-y-1 text-xs font-mono text-muted-foreground">
                      <div>GRAPH_TENANT_ID=&lt;id do diretório (tenant)&gt;</div>
                      <div>GRAPH_CLIENT_ID=&lt;id do aplicativo (client)&gt;</div>
                      <div>GRAPH_CLIENT_SECRET=&lt;valor do segredo&gt;</div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>2. Ativar Recebimento</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label>Caixa compartilhada (Microsoft 365)</Label>
                        <Input
                          value={settings.sharedMailboxAddress ?? ""}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              sharedMailboxAddress: e.target.value,
                            })
                          }
                          placeholder="suporte@alletecnologia.com"
                        />
                        <p className="text-xs text-muted-foreground">
                          Qual e-mail lê os emails? (Tenant ID e Client ID devem ter acesso)
                        </p>
                      </div>

                      <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-md border border-blue-200 dark:border-blue-900">
                        <p className="text-xs text-muted-foreground">
                          <strong>Status Graph API:</strong>{" "}
                          {settings.graphConfigured &&
                          settings.graphClientSecretConfigured
                            ? "✓ Configurado (Tenant, Client e Secret prontos)"
                            : "⚠ Incompleto (defina as 3 variáveis no backend)"}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-3 rounded-md border border-input p-3">
                        <div className="min-w-0">
                          <Label htmlFor="inbound-enabled" className="font-medium">
                            Receber e-mails desta caixa
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            {settings.enabled
                              ? "Ativo — a caixa é lida automaticamente a cada 1 minuto."
                              : "Desligado — nenhum e-mail vira pré-ticket."}
                          </p>
                        </div>
                        <Switch
                          id="inbound-enabled"
                          checked={settings.enabled}
                          disabled={busy}
                          aria-label="Ativar recebimento de e-mails"
                          onCheckedChange={(checked) =>
                            setSettings({ ...settings, enabled: checked })
                          }
                        />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          disabled={busy}
                          onClick={() => void saveSettings()}
                        >
                          Salvar Configuração
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void pollNow()}
                        >
                          <RefreshCw className="mr-1 size-4" />
                          Buscar Agora
                        </Button>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        <strong>Automação:</strong> Com recebimento ativo, a caixa é lida a cada 1 minuto.
                        O botão &quot;Buscar Agora&quot; força uma leitura imediata.
                        Emails duplicados (mesmo message-id) são ignorados.
                      </p>
                      {settings.lastPolledAt ? (
                        <p className="text-xs text-muted-foreground">
                          <strong>Última leitura:</strong>{" "}
                          {new Date(settings.lastPolledAt).toLocaleString("pt-BR")}
                        </p>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>3. Filtros & Bloqueios</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="blocked-sender">
                        Remetentes bloqueados
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        E-mails desses remetentes nunca viram pré-ticket. Use o
                        endereço completo (<code>noreply@empresa.com</code>) ou
                        um domínio inteiro (<code>*@newsletter.com</code>).
                      </p>

                      <div className="flex flex-wrap items-start gap-2">
                        <Input
                          id="blocked-sender"
                          className="min-w-0 flex-1 sm:max-w-sm"
                          value={blockedDraft}
                          onChange={(e) => {
                            setBlockedDraft(e.target.value);
                            if (blockedError) setBlockedError("");
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addBlockedSender();
                            }
                          }}
                          placeholder="noreply@empresa.com ou *@newsletter.com"
                          aria-invalid={blockedError ? true : undefined}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy || !blockedDraft.trim()}
                          onClick={addBlockedSender}
                        >
                          <Plus className="mr-1 size-4" />
                          Adicionar
                        </Button>
                      </div>

                      {blockedError ? (
                        <p className="text-xs font-medium text-destructive">
                          {blockedError}
                        </p>
                      ) : null}

                      {blockedList.length ? (
                        <ul className="divide-y rounded-md border">
                          {blockedList.map((entry) => (
                            <li
                              key={entry}
                              className="flex items-center justify-between gap-3 px-3 py-2"
                            >
                              <span className="min-w-0 truncate font-mono text-sm">
                                {entry}
                              </span>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-8 shrink-0"
                                disabled={busy}
                                title={`Desbloquear ${entry}`}
                                aria-label={`Desbloquear ${entry}`}
                                onClick={() => removeBlockedSender(entry)}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                          Nenhum remetente bloqueado.
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() => void saveSettings()}
                    >
                      Salvar Filtros
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>4. Roteamento de E-mails</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Direcione emails específicos para mesas/clientes/prioridades.
                      Sem regra, o email vira pré-ticket aberto (sem mesa).
                    </p>

                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                      <div className="space-y-1">
                        <Label className="text-xs">E-mail ou Domínio *</Label>
                        <Input
                          value={matchEmail}
                          onChange={(e) => setMatchEmail(e.target.value)}
                          placeholder="monitoramento@alletecnologia.com"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Mesa (opcional)</Label>
                        <SearchableSelectField
                          value={routeDeskId}
                          onChange={setRouteDeskId}
                          placeholder="Selecione"
                          emptyLabel="Nenhuma"
                          options={[
                            { value: "", label: "—" },
                            ...desks.map((d) => ({
                              value: d.id,
                              label: d.name,
                            })),
                          ]}
                          preserveOrder
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Cliente (opcional)</Label>
                        <SearchableSelectField
                          value={routeCompanyId}
                          onChange={setRouteCompanyId}
                          placeholder="Selecione"
                          emptyLabel="Todos"
                          options={[
                            { value: "", label: "Todos" },
                            ...companies.map((c) => ({
                              value: c.id,
                              label: c.name,
                            })),
                          ]}
                          preserveOrder
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Prioridade (opcional)</Label>
                        <Input
                          value={priorityName}
                          onChange={(e) => setPriorityName(e.target.value)}
                          placeholder="Baixa, Média, Alta"
                        />
                      </div>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          className="w-full"
                          disabled={busy}
                          onClick={() => void addRoute()}
                        >
                          <Plus className="mr-1 size-4" />
                          Adicionar
                        </Button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="py-2 px-3 text-left font-medium">E-mail/Domínio</th>
                            <th className="py-2 px-3 text-left font-medium">Mesa</th>
                            <th className="py-2 px-3 text-left font-medium">Cliente</th>
                            <th className="py-2 px-3 text-left font-medium">Prioridade</th>
                            <th className="py-2 px-3 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {routes.map((r) => (
                            <tr key={r.id} className="border-b hover:bg-muted/30">
                              <td className="py-2 px-3 font-mono text-xs">{r.matchEmail}</td>
                              <td className="py-2 px-3">{r.desk?.name ?? "—"}</td>
                              <td className="py-2 px-3">{r.company?.name ?? "Todos"}</td>
                              <td className="py-2 px-3">{r.priorityName ?? "—"}</td>
                              <td className="py-2 px-3 text-right">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  onClick={() => void removeRoute(r.id)}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                          {routes.length === 0 ? (
                            <tr>
                              <td
                                colSpan={5}
                                className="py-4 px-3 text-center text-muted-foreground"
                              >
                                Nenhuma regra ainda. Emails vão abrir direto para triagem.
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </div>
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}
