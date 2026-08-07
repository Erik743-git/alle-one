"use client";

import { useCallback, useEffect, useState } from "react";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import AppShell from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export default function AdminEmailPage() {
  const [tab, setTab] = useState<Tab>("recebimento");
  const [settings, setSettings] = useState<EmailInboundSettings | null>(null);
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
              <Card>
                <CardHeader>
                  <CardTitle>Geral</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    Separador de resposta e logos de assinatura ficam para uma
                    próxima iteração. O recebimento via Microsoft Graph já está
                    na aba Recebimento.
                  </p>
                </CardContent>
              </Card>
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
                    <CardTitle>Configure a abertura de ticket por e-mail</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ol className="list-decimal pl-5 text-sm space-y-2 text-muted-foreground">
                      <li>
                        No Azure AD, registre um app com permissão Application{" "}
                        <code>Mail.Read</code> na caixa compartilhada e defina{" "}
                        <code>GRAPH_TENANT_ID</code>, <code>GRAPH_CLIENT_ID</code>{" "}
                        e <code>GRAPH_CLIENT_SECRET</code> no backend.
                      </li>
                      <li>
                        Informe o endereço da caixa (ex.: suporte@…) abaixo e
                        ative o recebimento. E-mails viram pré-tickets para
                        triagem.
                      </li>
                    </ol>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label>Caixa compartilhada</Label>
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
                      </div>
                      <div className="space-y-1">
                        <Label>Usar como solicitante</Label>
                        <Input value={settings.useAsRequester} disabled />
                      </div>
                      <div className="space-y-1">
                        <Label>Graph Tenant ID</Label>
                        <Input
                          value={settings.graphTenantId ?? ""}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              graphTenantId: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Graph Client ID</Label>
                        <Input
                          value={settings.graphClientId ?? ""}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              graphClientId: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label>Remetentes bloqueados (não viram pré-ticket)</Label>
                      <textarea
                        className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={settings.blockedSenders ?? ""}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            blockedSenders: e.target.value,
                          })
                        }
                        placeholder={
                          "noreply@empresa.com\n*@newsletter.com\nmonitoramento@…"
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Um por linha: e-mail completo ou domínio (
                        <code>*@dominio.com</code>). Esses remetentes não geram
                        pré-ticket e não voltam a ser processados.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={settings.enabled}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              enabled: e.target.checked,
                            })
                          }
                        />
                        Recebimento ativo
                      </label>
                      <span>
                        Graph:{" "}
                        {settings.graphConfigured &&
                        settings.graphClientSecretConfigured
                          ? "configurado"
                          : "incompleto (env)"}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy}
                        onClick={() => void saveSettings()}
                      >
                        Salvar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void pollNow()}
                      >
                        <RefreshCw className="mr-1 size-4" />
                        Buscar
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Com o recebimento ativo, a caixa é lida{" "}
                      <strong>automaticamente a cada minuto</strong>. O botão
                      Buscar só força uma leitura imediata. Mensagens já
                      convertidas (mesmo message-id) não viram pré-ticket
                      duplicado.
                    </p>
                    {settings.lastPolledAt ? (
                      <p className="text-xs text-muted-foreground">
                        Última leitura:{" "}
                        {new Date(settings.lastPolledAt).toLocaleString("pt-BR")}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Direcionamentos</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-2 items-end">
                      <div className="min-w-[12rem] flex-1 space-y-1">
                        <Label>E-mail (remetente ou *@dominio)</Label>
                        <Input
                          value={matchEmail}
                          onChange={(e) => setMatchEmail(e.target.value)}
                          placeholder="monitoramento@…"
                        />
                      </div>
                      <div className="min-w-[10rem] space-y-1">
                        <Label>Mesa</Label>
                        <SearchableSelectField
                          value={routeDeskId}
                          onChange={setRouteDeskId}
                          placeholder="Opcional"
                          emptyLabel="Nenhuma mesa"
                          options={[
                            { value: "", label: "— (nenhuma)" },
                            ...desks.map((d) => ({
                              value: d.id,
                              label: d.name,
                            })),
                          ]}
                          preserveOrder
                        />
                      </div>
                      <div className="min-w-[10rem] space-y-1">
                        <Label>Cliente</Label>
                        <SearchableSelectField
                          value={routeCompanyId}
                          onChange={setRouteCompanyId}
                          placeholder="Opcional"
                          emptyLabel="Nenhum cliente"
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
                      <div className="min-w-[8rem] space-y-1">
                        <Label>Prioridade</Label>
                        <Input
                          value={priorityName}
                          onChange={(e) => setPriorityName(e.target.value)}
                        />
                      </div>
                      <Button
                        type="button"
                        disabled={busy}
                        onClick={() => void addRoute()}
                      >
                        <Plus className="mr-1 size-4" />
                        Direcionamento
                      </Button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground">
                            <th className="py-2 pr-3">E-mail</th>
                            <th className="py-2 pr-3">Mesa</th>
                            <th className="py-2 pr-3">Cliente</th>
                            <th className="py-2 pr-3">Prioridade</th>
                            <th className="py-2 pr-3">Verificado</th>
                            <th className="py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {routes.map((r) => (
                            <tr key={r.id} className="border-b">
                              <td className="py-2 pr-3">{r.matchEmail}</td>
                              <td className="py-2 pr-3">
                                {r.desk?.name ?? "—"}
                              </td>
                              <td className="py-2 pr-3">
                                {r.company?.name ?? "Todos"}
                              </td>
                              <td className="py-2 pr-3">
                                {r.priorityName ?? "—"}
                              </td>
                              <td className="py-2 pr-3">
                                {r.verified ? "✓" : "—"}
                              </td>
                              <td className="py-2">
                                <Button
                                  size="icon"
                                  variant="ghost"
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
                                colSpan={6}
                                className="py-6 text-muted-foreground"
                              >
                                Nenhum direcionamento ainda.
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
