"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { type IssueState, type IssueProject } from "@/lib/project-issues";
import { applyIssueImport, issueTable, readIssueCsv, writeIssueCsv, type IssueTable } from "@/lib/issue-transfer";
import { readIssueExcel, writeIssueExcel } from "@/lib/issue-excel";
import { triggerBrowserDownload } from "@/lib/download-blob";
export function IssueDataTools({ state, projects, onImport }: { state: IssueState; projects: IssueProject[]; onImport: (table: IssueTable) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<IssueTable | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function download(format: "xlsx" | "csv") {
    setBusy(true); setError("");
    try { const table = issueTable(state, projects); const content = format === "xlsx" ? await writeIssueExcel(table) : writeIssueCsv(table); triggerBrowserDownload(new Blob([content], { type: format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv;charset=utf-8" }), `demandas.${format}`); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível exportar."); } finally { setBusy(false); }
  }
  return <div className="space-y-2"><div className="flex flex-wrap gap-2">
    <Button size="sm" variant="outline" disabled={busy} onClick={() => void download("xlsx")}>Exportar Excel</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void download("csv")}>Exportar CSV</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}>Importar demandas</Button>
    <Input ref={input} type="file" accept=".xlsx,.csv" aria-label="Arquivo de demandas" className="sr-only" onChange={async (event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; setBusy(true); setError(""); setMessage(""); try { if (file.size > 15000000) throw new Error("Use um arquivo de até 15 MB."); const table = file.name.toLowerCase().endsWith(".xlsx") ? await readIssueExcel(await file.arrayBuffer()) : readIssueCsv(await file.text()); applyIssueImport(state, projects, table, () => crypto.randomUUID()); setPreview(table); } catch (err) { setError(err instanceof Error ? err.message : "Arquivo inválido."); } finally { setBusy(false); } }} />
  </div>{busy && <p role="status" className="text-sm text-muted-foreground">Processando arquivo…</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    <Dialog open={!!preview} onOpenChange={(open) => { if (!open) setPreview(null); }}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Importar {preview?.rows.length} demandas</DialogTitle><DialogDescription>Os registros serão adicionados como novas demandas, com novos códigos. As demandas existentes serão preservadas.</DialogDescription></DialogHeader>
      <div className="max-h-64 overflow-auto rounded-lg border"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Título</th><th className="p-2">Projeto</th><th className="p-2">Status</th></tr></thead><tbody>{preview?.rows.slice(0, 20).map((row, i) => <tr key={i} className="border-t">{["Título", "Projeto", "Status"].map((key) => <td className="p-2" key={key}>{row[preview.headers.indexOf(key)]}</td>)}</tr>)}</tbody></table></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPreview(null)}>Cancelar</Button><Button onClick={() => { if (!preview) return; try { onImport(preview); setMessage(`${preview.rows.length} demandas importadas.`); setPreview(null); } catch (err) { setError(err instanceof Error ? err.message : "Falha ao importar."); } }}>Confirmar importação</Button></div>
    </DialogContent></Dialog>
  </div>;
}
