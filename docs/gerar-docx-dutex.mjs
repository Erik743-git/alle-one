import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertInchesToTwip,
} from "docx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logoPath = path.resolve(__dirname, "../frontend/public/logo-alle-cinza.png");
const simboloPath = path.resolve(__dirname, "../frontend/public/alle-simbolo.png");
const outPath = path.resolve(
  __dirname,
  process.env.DOCX_OUT || "ALLE_Dutex_Portal_Chamados_e_Ativos.docx",
);

const brandBlue = "00A8E8";
const ink = "1A1A1A";
const muted = "555555";
const line = "CCCCCC";

const logoBuf = fs.readFileSync(logoPath);
const simboloBuf = fs.readFileSync(simboloPath);

function p(text, opts = {}) {
  const {
    bold = false,
    size = 22,
    color = ink,
    align = AlignmentType.JUSTIFIED,
    spacingAfter = 140,
    spacingBefore = 0,
    italics = false,
  } = opts;
  return new Paragraph({
    alignment: align,
    spacing: { after: spacingAfter, before: spacingBefore, line: 276 },
    children: [
      new TextRun({ text, bold, italics, size, color, font: "Calibri" }),
    ],
  });
}

function heading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 300, after: 120 },
    children: [
      new TextRun({ text, bold: true, size: 26, color: ink, font: "Calibri" }),
    ],
  });
}

function sub(text) {
  return new Paragraph({
    spacing: { before: 160, after: 80 },
    children: [
      new TextRun({ text, bold: true, size: 22, color: ink, font: "Calibri" }),
    ],
  });
}

function bullet(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 70, line: 276 },
    indent: { left: convertInchesToTwip(0.2) },
    children: [
      new TextRun({ text: "•  ", size: 22, color: brandBlue, font: "Calibri" }),
      new TextRun({ text, size: 22, color: ink, font: "Calibri" }),
    ],
  });
}

function mono(text) {
  return new Paragraph({
    spacing: { after: 40, line: 260 },
    indent: { left: convertInchesToTwip(0.15) },
    children: [
      new TextRun({ text, size: 18, color: ink, font: "Consolas" }),
    ],
  });
}

function cell(text, opts = {}) {
  const { bold = false, width = 2340, fill = "FFFFFF", center = false } = opts;
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, fill },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: line },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: line },
      left: { style: BorderStyle.SINGLE, size: 4, color: line },
      right: { style: BorderStyle.SINGLE, size: 4, color: line },
    },
    children: [
      new Paragraph({
        alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: { after: 40, before: 40 },
        children: [
          new TextRun({ text, bold, size: 18, color: ink, font: "Calibri" }),
        ],
      }),
    ],
  });
}

const doc = new Document({
  creator: "ALLE Tecnologia",
  title: "ALLE × Dutex — Chamados, equipamentos e monitoramento",
  description: "Alinhamento ALLE One × DUTEX.AI",
  sections: [
    {
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(0.85),
            bottom: convertInchesToTwip(0.8),
            left: convertInchesToTwip(0.95),
            right: convertInchesToTwip(0.95),
          },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              spacing: { after: 60 },
              children: [
                new ImageRun({
                  type: "png",
                  data: logoBuf,
                  transformation: { width: 140, height: 45 },
                  altText: {
                    title: "ALLE Tecnologia",
                    description: "Logotipo ALLE",
                    name: "logo-alle",
                  },
                }),
              ],
            }),
            new Paragraph({
              border: {
                bottom: { style: BorderStyle.SINGLE, size: 10, color: brandBlue },
              },
              spacing: { after: 100 },
              children: [
                new TextRun({
                  text: "ALLE Tecnologia  ·  Dutex Industrial  ·  Julho/2026",
                  size: 16,
                  color: muted,
                  font: "Calibri",
                }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              border: {
                top: { style: BorderStyle.SINGLE, size: 6, color: line },
              },
              spacing: { before: 60 },
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: "Uso interno ALLE e Dutex — não redistribuir  ·  p. ",
                  size: 14,
                  color: muted,
                  font: "Calibri",
                }),
                new TextRun({
                  children: [PageNumber.CURRENT],
                  size: 14,
                  color: muted,
                  font: "Calibri",
                }),
              ],
            }),
          ],
        }),
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [
            new ImageRun({
              type: "png",
              data: simboloBuf,
              transformation: { width: 48, height: 48 },
              altText: {
                title: "Símbolo ALLE",
                description: "Símbolo ALLE",
                name: "alle-simbolo",
              },
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 40 },
          children: [
            new TextRun({
              text: "Chamados, equipamentos e monitoramento",
              bold: true,
              size: 32,
              color: ink,
              font: "Calibri",
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
          children: [
            new TextRun({
              text: "Como o portal ALLE One e o DUTEX.AI se encaixam",
              size: 22,
              color: muted,
              font: "Calibri",
            }),
          ],
        }),

        heading("1. Em uma frase"),
        p(
          "A ALLE cuida do atendimento (chamado, histórico, horas). A Dutex cuida da visão interna (o que tem, o que vence, quanto custa). O número do chamado ALLE é a ponte entre os dois. Não há dois helpdesks.",
        ),

        heading("2. O que a Dutex acessa no portal"),
        bullet("Login próprio, só dados da empresa."),
        bullet("Chamados: ver lista, detalhe, andamento e anexos."),
        bullet("Horas: ver apontamentos e questionar se precisar."),
        bullet("Inventário no portal: consultar o que estiver cadastrado para a empresa (quando houver)."),
        p(
          "Abrir chamado, mudar estágio e apontar hora fica com a equipe ALLE. Assim o histórico fica em um só lugar.",
          { spacingBefore: 40 },
        ),

        heading("3. Como nasce e fecha um chamado"),
        bullet("E-mail para a caixa da ALLE → vira pré-atendimento → vira chamado com número."),
        bullet("Ou a equipe ALLE abre direto no portal."),
        bullet(
          "WhatsApp pode continuar no dia a dia — mas o atendimento precisa terminar registrado no portal, senão ninguém mede volume nem tempo.",
        ),
        p(
          "Do lado Dutex: anotar equipamento/prioridade no DUTEX.AI, guardar o número ALLE, acompanhar no portal, medir indicadores internos depois do encerramento.",
          { spacingBefore: 40 },
        ),

        heading("4. Equipamentos e checkup"),
        p(
          "Patrimônio completo (equipamento, licença, contrato, custo, vencimento) fica no DUTEX.AI. Não precisa duplicar tudo no portal.",
        ),
        p(
          "Do lado ALLE, “checkup” de equipamento no atendimento é operacional: identificar o item no chamado (descrição / referência Dutex), agir, registrar solução e horas. O inventário do portal é apoio interno da ALLE — lembrete de vencimento, consulta — e hoje não amarra automaticamente ativo ↔ chamado.",
        ),
        p(
          "Checkup de infraestrutura (máquina no ar, alerta) é outra camada: monitoramento. Não é o mesmo que inventário de bens.",
        ),

        heading("5. Monitoramento"),
        p(
          "Quando contratado, a ALLE acompanha hosts/alertas no ambiente de monitoramento ligado à empresa. Isso responde “a máquina está ok?”. Não substitui o cadastro de patrimônio nem a fila de chamados. Alerta de monitoramento, hoje, não abre chamado sozinho — a equipe avalia e registra se precisar.",
        ),

        heading("6. Mapa técnico — o que vive em cada lado"),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [2600, 3380, 3380],
          rows: [
            new TableRow({
              children: [
                cell("Camada", { bold: true, width: 2600, fill: "EEF7FC" }),
                cell("DUTEX.AI (Dutex)", { bold: true, width: 3380, fill: "EEF7FC" }),
                cell("ALLE One (ALLE)", { bold: true, width: 3380, fill: "EEF7FC" }),
              ],
            }),
            new TableRow({
              children: [
                cell("Chamado / fila", { bold: true, width: 2600 }),
                cell("Anota necessidade; guarda nº ALLE", { width: 3380 }),
                cell("Abre, executa, histórico, fecha", { width: 3380 }),
              ],
            }),
            new TableRow({
              children: [
                cell("Horas / tempo", { bold: true, width: 2600 }),
                cell("Indicadores internos (tempo total etc.)", { width: 3380 }),
                cell("Apontamentos oficiais da equipe", { width: 3380 }),
              ],
            }),
            new TableRow({
              children: [
                cell("Patrimônio / custo", { bold: true, width: 2600 }),
                cell("Fonte de verdade", { width: 3380 }),
                cell("Inventário opcional (apoio ALLE)", { width: 3380 }),
              ],
            }),
            new TableRow({
              children: [
                cell("Vencimento licença/garantia", { bold: true, width: 2600 }),
                cell("Alertas do módulo de TI", { width: 3380 }),
                cell("Lembrete interno se ativo estiver no portal", { width: 3380 }),
              ],
            }),
            new TableRow({
              children: [
                cell("Monitoramento hosts", { bold: true, width: 2600 }),
                cell("—", { width: 3380 }),
                cell("Console / monitoramento (equipe ALLE)", { width: 3380 }),
              ],
            }),
            new TableRow({
              children: [
                cell("Ponte entre sistemas", { bold: true, width: 2600 }),
                cell("Número do chamado ALLE", { width: 3380 }),
                cell("Gera o número oficial", { width: 3380 }),
              ],
            }),
            new TableRow({
              children: [
                cell("API automática", { bold: true, width: 2600 }),
                cell("Desejável depois (custo à parte)", { width: 3380 }),
                cell("Ainda não liberada como produto B2B", { width: 3380 }),
              ],
            }),
          ],
        }),

        sub("Fluxo atual (sem API)"),
        mono("Dutex / WhatsApp / e-mail"),
        mono("        ↓"),
        mono("ALLE One  →  gera nº do chamado"),
        mono("        ↓"),
        mono("Dutex guarda o nº no DUTEX.AI"),
        mono("        ↓"),
        mono("Dutex acompanha no portal  ·  ALLE executa e fecha"),
        mono("        ↓"),
        mono("Dutex consolida indicadores internos"),

        sub("Se um dia houver API (depois das frentes práticas)"),
        p(
          "Ideia: o DUTEX.AI criar ou consultar chamado e puxar status/número sozinho. Escopo ainda não fechado — só faz sentido depois de portal, e-mail e registro do WhatsApp estarem rodando.",
          { spacingAfter: 80 },
        ),
        mono("DUTEX.AI  ←→  (API futura)  ←→  ALLE One"),
        mono("consulta status / devolve número / (opcional) abertura"),

        heading("7. Próximos passos (ordem da Dutex)"),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [700, 2600, 6060],
          rows: [
            new TableRow({
              children: [
                cell("#", { bold: true, width: 700, fill: "EEF7FC", center: true }),
                cell("Frente", { bold: true, width: 2600, fill: "EEF7FC" }),
                cell("O que fazer", { bold: true, width: 6060, fill: "EEF7FC" }),
              ],
            }),
            new TableRow({
              children: [
                cell("1", { width: 700, center: true }),
                cell("Portal", { width: 2600, bold: true }),
                cell("Confirmar usuários Dutex e acesso aos chamados da empresa.", {
                  width: 6060,
                }),
              ],
            }),
            new TableRow({
              children: [
                cell("2", { width: 700, center: true }),
                cell("E-mail", { width: 2600, bold: true }),
                cell("Habilitar/testar abertura por e-mail até gerar número.", {
                  width: 6060,
                }),
              ],
            }),
            new TableRow({
              children: [
                cell("3", { width: 700, center: true }),
                cell("WhatsApp → registro", { width: 2600, bold: true }),
                cell("Combinar: atendimento no Zap também vira chamado no portal.", {
                  width: 6060,
                }),
              ],
            }),
            new TableRow({
              children: [
                cell("4", { width: 700, center: true }),
                cell("Proteção de rede", { width: 2600, bold: true }),
                cell("Infra (backup, antivírus, camadas) — fora do portal de chamados.", {
                  width: 6060,
                }),
              ],
            }),
            new TableRow({
              children: [
                cell("5", { width: 700, center: true }),
                cell("API", { width: 2600, bold: true }),
                cell("Avaliar só depois de 1–3. Envolve custo e escopo.", {
                  width: 6060,
                }),
              ],
            }),
          ],
        }),

        new Paragraph({ spacing: { before: 280 }, children: [] }),
        p(
          "ALLE Tecnologia  ·  Julho/2026",
          { align: AlignmentType.CENTER, color: muted, size: 18, spacingAfter: 0 },
        ),
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outPath, buffer);
console.log("Gerado:", outPath);
