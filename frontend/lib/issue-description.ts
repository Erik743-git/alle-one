import { isAppointmentDoc, parseAppointmentDoc, serializeAppointmentDoc, appointmentDescriptionToPlainText, sanitizeComposerHtml, stripHtmlToPlain, type StoredBlock } from "@/lib/appointment-doc";
export const MAX_DESCRIPTION_SIZE = 1500000;
export function validateIssueDescription(value: string) {
  if (typeof value !== "string" || value.length > MAX_DESCRIPTION_SIZE) throw new Error("A descrição deve ocupar no máximo 1,5 MB, incluindo imagens.");
  if (!isAppointmentDoc(value)) return;
  const doc = parseAppointmentDoc(value);
  if (!doc || doc.blocks.length > 200) throw new Error("Descrição estruturada inválida.");
  for (const block of doc.blocks) {
    if (block.type === "text") { if (typeof block.content !== "string") throw new Error("Texto inválido na descrição.");
      if (block.html) {
        const allowed = new Set(["b", "strong", "i", "em", "u", "s", "strike", "br", "p", "div", "ul", "ol", "li", "span", "a", "h1", "h2", "h3", "h4", "blockquote", "pre", "code", "font"]);
        const tags = [...block.content.matchAll(/<\/?\s*([a-z][a-z0-9]*)\b/gi)];
        if (tags.some((tag) => !allowed.has(tag[1].toLowerCase())) || /\bon\w+\s*=|javascript\s*:|vbscript\s*:|url\s*\(|expression\s*\(/i.test(block.content)) throw new Error("A descrição contém formatação não permitida.");
      } }
    else if (block.type === "image") {
      if (!block.dataUrl || !/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(block.dataUrl)) throw new Error("Use imagens PNG, JPEG, GIF ou WebP incorporadas à descrição.");
    } else throw new Error("Bloco de descrição inválido.");
  }
}
export function safeEditorDescription(value: string) {
  validateIssueDescription(value);
  // Plain descriptions remain text, even when they contain HTML-looking input.
  if (!isAppointmentDoc(value)) return serializeAppointmentDoc([{ type: "text", content: value }]);
  return serializeAppointmentDoc(parseAppointmentDoc(value)!.blocks.map((block) => {
    if (block.type !== "text" || !block.html) return block;
    let content = block.content;
    for (let i = 0; i < 10; i++) { const cleaned = sanitizeComposerHtml(content); if (cleaned === content) return { ...block, content }; content = cleaned; }
    return { type: "text" as const, content: stripHtmlToPlain(content) };
  }));
}
export const issueDescriptionText = (value: string) => appointmentDescriptionToPlainText(value);
export function descriptionSections(sections: string): string {
  return serializeAppointmentDoc(sections.split(/\r?\n|\//).map((s) => s.trim()).filter(Boolean).map((content): StoredBlock => ({ type: "text", content: `• ${content}\n\n` })));
}
