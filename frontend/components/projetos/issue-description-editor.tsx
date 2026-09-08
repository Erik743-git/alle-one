"use client";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { AppointmentDescriptionComposer, type AppointmentBlockComposerHandle } from "@/components/tickets/appointment-description-composer";
import { Button } from "@/components/ui/button";
import { parseAppointmentDoc, serializeAppointmentDoc, type StoredBlock } from "@/lib/appointment-doc";
import { safeEditorDescription, validateIssueDescription } from "@/lib/issue-description";
const NO_ATTACHMENTS: [] = [];
export type IssueDescriptionHandle = { read: () => Promise<string> };
async function imageData(file: File) {
  if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) throw new Error("Use imagens PNG, JPEG, GIF ou WebP.");
  if (file.size > 1000000) throw new Error("Cada imagem deve ter até 1 MB.");
  return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Não foi possível ler a imagem.")); reader.readAsDataURL(file); });
}
export const IssueDescriptionEditor = forwardRef<IssueDescriptionHandle, { initialValue: string; disabled?: boolean }>(function IssueDescriptionEditor({ initialValue, disabled }, ref) {
  const composer = useRef<AppointmentBlockComposerHandle>(null), input = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState(() => safeEditorDescription(initialValue)), [revision, setRevision] = useState(0), [error, setError] = useState("");
  async function read() {
    if (!composer.current?.isReady()) throw new Error("Aguarde a descrição carregar.");
    const exported = composer.current.exportContent();
    if (!exported) throw new Error("Aguarde o editor carregar.");
    const doc = parseAppointmentDoc(exported.description);
    const blocks: StoredBlock[] = await Promise.all((doc?.blocks ?? []).map(async (block) => block.type === "image" ? { ...block, dataUrl: await imageData(exported.files[block.fileIndex]) } : block));
    const result = serializeAppointmentDoc(blocks); validateIssueDescription(result); return result;
  }
  useImperativeHandle(ref, () => ({ read }));
  return <div className="space-y-2">
    <AppointmentDescriptionComposer key={revision} ref={composer} initialDescription={source} initialAttachments={NO_ATTACHMENTS} required={false} disabled={disabled} hideAttachments placeholder="Descreva a demanda. Cole ou arraste imagens aqui." />
    <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => input.current?.click()}><ImagePlus className="mr-2 h-4 w-4" />Inserir imagem</Button>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/gif,image/webp" aria-label="Imagem da descrição" className="sr-only" onChange={async (event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; try { const value = await read(); const blocks = parseAppointmentDoc(value)!.blocks; const next = serializeAppointmentDoc([...blocks, { type: "image", fileIndex: blocks.filter((b) => b.type === "image").length, width: 280, dataUrl: await imageData(file) }]); validateIssueDescription(next); setSource(next); setRevision((n) => n + 1); setError(""); } catch (err) { setError(err instanceof Error ? err.message : "Falha ao inserir imagem."); } }} />
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
});
