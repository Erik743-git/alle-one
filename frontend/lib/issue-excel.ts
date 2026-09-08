import type { IssueTable } from "@/lib/issue-transfer";
import { parseAppointmentDoc, serializeAppointmentDoc } from "@/lib/appointment-doc";
import { issueDescriptionText } from "@/lib/issue-description";
import { validateTemplate, type IssueTemplate } from "@/lib/issue-templates";
export async function writeIssueExcel(table: IssueTable): Promise<ArrayBuffer> {
  const { Workbook } = await import("@alleone/exceljs-browser");
  const book = new Workbook(); book.creator = "Alleone";
  const sheet = book.addWorksheet("Demandas", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.addRow(table.headers);
  const content = book.addWorksheet("Conteudos"); content.addRow(["Registro", "Parte", "Descrição estruturada"]);
  const richIndex = table.headers.indexOf("Descrição estruturada");
  table.rows.forEach((row, index) => {
    const cells = [...row], rich = richIndex >= 0 ? cells[richIndex] : "";
    if (rich) { cells[richIndex] = `conteudo:${index + 1}`; for (let i = 0; i < rich.length; i += 30000) content.addRow([index + 1, i / 30000, rich.slice(i, i + 30000)]); }
    if (cells.some((c) => c.length > 32767)) throw new Error("Um campo excede o limite de texto do Excel. Use CSV para esse conteúdo.");
    sheet.addRow(cells);
  });
  content.state = "veryHidden";
  for (const field of ["ID", "Empresa", "Projeto ID", "Responsável ID", "Responsáveis IDs", "Descrição estruturada"]) { const index = table.headers.indexOf(field); if (index >= 0) sheet.getColumn(index + 1).hidden = true; }
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF173A55" } };
  sheet.getRow(1).height = 30;
  sheet.columns.forEach((col, i) => { col.width = ["Título", "Descrição", "Projeto"].includes(table.headers[i]) ? 44 : 24; });
  sheet.eachRow((row, n) => { row.alignment = { vertical: "top", wrapText: true }; if (n > 1) row.height = 48; });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: table.rows.length + 1, column: table.headers.length } };
  return await book.xlsx.writeBuffer() as unknown as ArrayBuffer;
}
export async function readIssueExcel(buffer: ArrayBuffer): Promise<IssueTable> {
  if (buffer.byteLength > 15000000) throw new Error("A planilha deve ter até 15 MB.");
  const { Workbook } = await import("@alleone/exceljs-browser"); const book = new Workbook();
  await book.xlsx.load(buffer);
  const sheet = book.getWorksheet("Demandas") ?? book.worksheets[0];
  if (!sheet || sheet.rowCount > 1001 || sheet.columnCount > 60) throw new Error("Planilha inválida ou acima do limite de 1.000 demandas.");
  const headers = Array.from({ length: sheet.columnCount }, (_, i) => sheet.getRow(1).getCell(i + 1).text.trim());
  const rows: string[][] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const values = headers.map((_, i) => {
      const cell = sheet.getRow(r).getCell(i + 1);
      if (cell.formula) throw new Error(`Linha ${r}: use valores, não fórmulas.`);
      if (cell.value instanceof Date) return cell.value.toISOString().slice(0, 10);
      return cell.text;
    });
    if (values.some(Boolean)) rows.push(values);
  }
  const richIndex = headers.indexOf("Descrição estruturada"), content = book.getWorksheet("Conteudos");
  if (richIndex >= 0) {
    const parts = new Map<string, Map<number, string>>(); let total = 0;
    content?.eachRow((row, n) => { if (n === 1) return; total += row.getCell(3).text.length; if (total > 15000000) throw new Error("Conteúdo incorporado excede 15 MB."); const key = row.getCell(1).text, part = Number(row.getCell(2).value); const map = parts.get(key) ?? new Map(); if (!Number.isSafeInteger(part) || part < 0 || map.has(part)) throw new Error("Conteúdo incorporado inválido."); map.set(part, row.getCell(3).text); parts.set(key, map); });
    rows.forEach((row) => { if (!row[richIndex].startsWith("conteudo:")) return; const map = parts.get(row[richIndex].slice(9)); if (!map) throw new Error("Descrição incorporada não encontrada."); const sorted = [...map].sort(([a], [b]) => a - b); if (sorted.some(([n], i) => n !== i)) throw new Error("Descrição incorporada incompleta."); row[richIndex] = sorted.map(([, text]) => text).join(""); });
  }
  return { headers, rows };
}

const TEMPLATE_HEADERS = ["Nome", "Tipo", "Prioridade", "Departamento", "Etiquetas", "Descrição", "Descrição estruturada"];

export async function writeIssueTemplatesExcel(templates: IssueTemplate[]): Promise<ArrayBuffer> {
  const { Workbook } = await import("@alleone/exceljs-browser");
  const book = new Workbook(); book.creator = "Alleone";
  const sheet = book.addWorksheet("Modelos", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.addRow(TEMPLATE_HEADERS);
  const content = book.addWorksheet("Conteudos"); content.addRow(["Registro", "Parte", "Descrição estruturada"]);
  templates.forEach((template, index) => {
    const key = `modelo:${index + 1}`;
    if (!template.description) content.addRow([key, 0, ""]);
    for (let i = 0; i < template.description.length; i += 30000) content.addRow([key, i / 30000, template.description.slice(i, i + 30000)]);
    sheet.addRow([template.name, template.issueType, template.priority, template.department, template.labels.join(" | "), issueDescriptionText(template.description), key]);
  });
  content.state = "veryHidden";
  sheet.getColumn(TEMPLATE_HEADERS.indexOf("Descrição estruturada") + 1).hidden = true;
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF173A55" } };
  sheet.getRow(1).height = 30;
  sheet.columns.forEach((column, index) => { column.width = ["Nome", "Descrição"].includes(TEMPLATE_HEADERS[index]) ? 48 : 24; });
  sheet.eachRow((row, number) => { row.alignment = { vertical: "top", wrapText: true }; if (number > 1) row.height = 48; });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, templates.length + 1), column: TEMPLATE_HEADERS.length } };
  return await book.xlsx.writeBuffer() as unknown as ArrayBuffer;
}

export async function readIssueTemplatesExcel(buffer: ArrayBuffer, companyId: string, newId: () => string): Promise<IssueTemplate[]> {
  if (buffer.byteLength > 15000000) throw new Error("A planilha deve ter até 15 MB.");
  const { Workbook } = await import("@alleone/exceljs-browser"); const book = new Workbook();
  await book.xlsx.load(buffer);
  const sheet = book.getWorksheet("Modelos") ?? book.worksheets[0];
  if (!sheet || sheet.rowCount < 2 || sheet.rowCount > 51 || sheet.columnCount > 20) throw new Error("Planilha inválida ou acima do limite de 50 modelos.");
  const headers = Array.from({ length: sheet.columnCount }, (_, index) => sheet.getRow(1).getCell(index + 1).text.trim());
  if (!["Nome", "Tipo", "Prioridade", "Descrição estruturada"].every((header) => headers.includes(header))) throw new Error("Use uma planilha de modelos exportada pelo Alleone.");
  const content = book.getWorksheet("Conteudos"), parts = new Map<string, Map<number, string>>(); let total = 0;
  content?.eachRow((row, number) => { if (number === 1) return; const text = row.getCell(3).text; total += text.length; if (total > 15000000) throw new Error("Conteúdo incorporado excede 15 MB."); const key = row.getCell(1).text, part = Number(row.getCell(2).value), map = parts.get(key) ?? new Map<number, string>(); if (!key || !Number.isSafeInteger(part) || part < 0 || map.has(part)) throw new Error("Conteúdo incorporado inválido."); map.set(part, text); parts.set(key, map); });
  const templates: IssueTemplate[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const values = Object.fromEntries(headers.map((header, index) => { const cell = sheet.getRow(rowNumber).getCell(index + 1); if (cell.formula) throw new Error(`Linha ${rowNumber}: use valores, não fórmulas.`); return [header, cell.text.trim()]; }));
    if (!Object.values(values).some(Boolean)) continue;
    const key = values["Descrição estruturada"], map = parts.get(key);
    if (!map) throw new Error(`Linha ${rowNumber}: descrição incorporada não encontrada.`);
    const sorted = [...map].sort(([a], [b]) => a - b);
    if (sorted.some(([part], index) => part !== index)) throw new Error(`Linha ${rowNumber}: descrição incorporada incompleta.`);
    let description = sorted.map(([, text]) => text).join("");
    if (values.Descrição !== undefined && values.Descrição !== issueDescriptionText(description)) {
      const images = parseAppointmentDoc(description)?.blocks.filter((block) => block.type === "image") ?? [];
      description = images.length ? serializeAppointmentDoc([{ type: "text", content: values.Descrição }, ...images]) : values.Descrição;
    }
    const template: IssueTemplate = { id: newId(), companyId, name: values.Nome, description, issueType: values.Tipo as IssueTemplate["issueType"], priority: values.Prioridade as IssueTemplate["priority"], department: values.Departamento ?? "", labels: (values.Etiquetas ?? "").split("|").map((label) => label.trim()).filter(Boolean) };
    validateTemplate(template, companyId); templates.push(template);
  }
  if (!templates.length) throw new Error("A planilha não contém modelos.");
  return templates;
}
