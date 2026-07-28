"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ProtectedPage from "@/components/auth/protected-page";
import AppShell from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  emailInboundService,
  type PreTicketDetail,
} from "@/lib/services/email-inbound.service";
import { Download, Trash2 } from "lucide-react";

export default function PreTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<PreTicketDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const row = await emailInboundService.getPreTicket(params.id);
        if (!cancelled) setItem(row);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Falha ao carregar");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  async function openTicket() {
    if (!item) return;
    setBusy(true);
    try {
      const r = await emailInboundService.openPreTicket(item.id);
      router.push(`/tickets/${r.ticketNumber}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao abrir");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!item) return;
    setBusy(true);
    try {
      await emailInboundService.deletePreTicket(item.id);
      router.push("/tickets/pre-tickets");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao remover");
    } finally {
      setBusy(false);
    }
  }

  async function downloadAttachment(attachment: {
    id: string;
    fileName: string;
  }) {
    if (!item) return;
    setDownloadingId(attachment.id);
    setError(null);
    try {
      await emailInboundService.downloadPreTicketAttachment({
        preTicketId: item.id,
        attachmentId: attachment.id,
        fileName: attachment.fileName,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao baixar anexo");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <ProtectedPage>
      <AppShell>
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" asChild>
              <Link href="/tickets/pre-tickets">Voltar</Link>
            </Button>
          </div>

          {error ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">{error}</p>
          ) : null}

          {!item ? (
            <p className="text-muted-foreground">Carregando…</p>
          ) : (
            <>
              <div className="space-y-2">
                <h1 className="text-xl font-semibold md:text-2xl">{item.title}</h1>
                <div className="grid gap-2 text-sm md:grid-cols-2">
                  <p>
                    <span className="text-muted-foreground">Solicitante: </span>
                    {item.fromName ?? "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">E-mail: </span>
                    {item.fromEmail}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Destinatário: </span>
                    {item.toEmails.join(", ") || item.mailboxAddress}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Cliente: </span>
                    {item.company?.name ?? "—"}
                  </p>
                </div>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Descrição</CardTitle>
                </CardHeader>
                <CardContent>
                  {item.descriptionHtml ? (
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none overflow-x-auto text-foreground [&_*]:!text-inherit [&_a]:!text-primary [&_img]:max-h-[480px] [&_img]:rounded-md"
                      dangerouslySetInnerHTML={{ __html: item.descriptionHtml }}
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap text-sm text-foreground">
                      {item.descriptionText || "(sem descrição)"}
                    </pre>
                  )}
                </CardContent>
              </Card>

              {item.attachments?.length ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Anexos ({item.attachments.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {item.attachments.map((a) => (
                      <div
                        key={a.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm"
                      >
                        <p className="min-w-0 flex-1 text-foreground">
                          <span className="font-medium">{a.fileName}</span>
                          <span className="text-muted-foreground">
                            {a.contentType ? ` · ${a.contentType}` : ""}
                            {a.sizeBytes != null
                              ? ` · ${Math.max(1, Math.round(a.sizeBytes / 1024))} KB`
                              : ""}
                          </span>
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy || downloadingId === a.id}
                          onClick={() => void downloadAttachment(a)}
                        >
                          <Download className="mr-1.5 size-3.5" />
                          {downloadingId === a.id ? "Baixando…" : "Baixar"}
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  <Trash2 className="mr-2 size-4" />
                  Remover
                </Button>
                <Button disabled={busy} onClick={() => void openTicket()}>
                  Abrir ticket
                </Button>
              </div>
            </>
          )}
        </div>
      </AppShell>
    </ProtectedPage>
  );
}
