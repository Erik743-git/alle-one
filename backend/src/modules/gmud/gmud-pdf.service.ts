import { Injectable } from '@nestjs/common';
import { GmudApproverStatus, GmudStatus } from '@prisma/client';
import { existsSync } from 'fs';
import { join } from 'path';
import PDFDocument from 'pdfkit';

const BRAND = '#0ea5c6';
const DARK = '#0f172a';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';

const STATUS_LABELS: Record<GmudStatus, string> = {
  DRAFT: 'Rascunho',
  PENDING_APPROVAL: 'Pendente de aprovação',
  APPROVED: 'Aprovada',
  IN_EXECUTION: 'Em execução',
  EXECUTED: 'Executada',
  REJECTED: 'Rejeitada',
  CANCELED: 'Cancelada',
};

const APPROVER_STATUS_LABELS: Record<GmudApproverStatus, string> = {
  PENDING: 'Pendente',
  APPROVED: 'Aprovou',
  REJECTED: 'Rejeitou',
};

type GmudPdfInput = {
  code: number;
  title: string;
  status: GmudStatus;
  downtime: boolean;
  downtimeStart: Date | null;
  downtimeEnd: Date | null;
  description: string | null;
  reason: string | null;
  impact: string | null;
  rollback: string | null;
  approvedAt: Date | null;
  executionStartedAt: Date | null;
  executedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  company: {
    name: string;
    logoFile: { path: string; mimeType: string } | null;
  };
  creator: { name: string; email: string };
  responsible: { name: string; email: string } | null;
  executors: Array<{ user: { id: string; name: string; email: string } }>;
  approvers: Array<{
    status: GmudApproverStatus;
    decidedAt: Date | null;
    decisionNote: string | null;
    user: { name: string; email: string };
  }>;
  activities: Array<{
    scheduledAt: Date;
    durationMinutes: number;
    executorUserId: string;
    description: string;
  }>;
  attachments: Array<{
    createdAt: Date;
    file: { originalName: string; size: number };
    uploader: { name: string };
  }>;
};

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function alleLogoCandidates(): string[] {
  const cwd = process.cwd();
  return [
    join(cwd, 'assets', 'brand', 'logo-alle-cinza.png'),
    join(cwd, '..', 'frontend', 'public', 'logo-alle-cinza.png'),
    join(cwd, 'dist', 'assets', 'brand', 'logo-alle-cinza.png'),
  ];
}

function tryEmbedImage(
  doc: InstanceType<typeof PDFDocument>,
  filePath: string,
  mimeType: string | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  if (!existsSync(filePath)) return false;
  if (mimeType === 'image/svg+xml') return false;
  try {
    doc.image(filePath, x, y, { fit: [width, height], align: 'center', valign: 'center' });
    return true;
  } catch {
    return false;
  }
}

@Injectable()
export class GmudPdfService {
  async build(gmud: GmudPdfInput): Promise<{ buffer: Buffer; filename: string }> {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 48, bottom: 56, left: 48, right: 48 },
      info: {
        Title: `GMUD #${gmud.code} — ${gmud.title}`,
        Author: 'Alle Tecnologia — AlleOne',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const contentLeft = doc.page.margins.left;
    let y = doc.page.margins.top;

    const ensureSpace = (needed: number) => {
      const bottom = doc.page.height - doc.page.margins.bottom;
      if (y + needed > bottom) {
        doc.addPage();
        y = doc.page.margins.top;
      }
    };

    const drawSectionTitle = (title: string) => {
      ensureSpace(36);
      doc
        .save()
        .rect(contentLeft, y, 4, 18)
        .fill(BRAND)
        .restore();
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor(DARK)
        .text(title, contentLeft + 10, y + 2);
      y += 28;
    };

    const drawParagraph = (label: string, value: string) => {
      const text = value?.trim() || '—';
      doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text(label, contentLeft, y);
      y += 14;
      doc.font('Helvetica').fontSize(10).fillColor(DARK);
      const height = doc.heightOfString(text, { width: pageWidth });
      ensureSpace(height + 8);
      doc.text(text, contentLeft, y, { width: pageWidth, lineGap: 3 });
      y += height + 14;
    };

    const drawKeyValueRow = (leftLabel: string, leftValue: string, rightLabel: string, rightValue: string) => {
      ensureSpace(20);
      const colWidth = pageWidth / 2 - 8;
      doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text(leftLabel, contentLeft, y, { width: colWidth });
      doc.text(rightLabel, contentLeft + colWidth + 16, y, { width: colWidth });
      y += 12;
      doc.font('Helvetica').fontSize(9).fillColor(DARK).text(leftValue, contentLeft, y, { width: colWidth });
      doc.text(rightValue, contentLeft + colWidth + 16, y, { width: colWidth });
      y += 18;
    };

    // Header
    const headerHeight = 52;
    let alleLogoDrawn = false;
    for (const candidate of alleLogoCandidates()) {
      if (tryEmbedImage(doc, candidate, 'image/png', contentLeft, y, 120, headerHeight)) {
        alleLogoDrawn = true;
        break;
      }
    }
    if (!alleLogoDrawn) {
      doc
        .font('Helvetica-Bold')
        .fontSize(16)
        .fillColor(BRAND)
        .text('Alle Tecnologia', contentLeft, y + 8);
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('Gerenciamento de Mudanças', contentLeft, y + 28);
    }

    const companyLogoX = contentLeft + pageWidth - 120;
    const companyLogoDrawn =
      gmud.company.logoFile &&
      tryEmbedImage(
        doc,
        gmud.company.logoFile.path,
        gmud.company.logoFile.mimeType,
        companyLogoX,
        y,
        120,
        headerHeight,
      );

    if (!companyLogoDrawn) {
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor(DARK)
        .text(gmud.company.name, companyLogoX, y + 16, { width: 120, align: 'right' });
    }

    y += headerHeight + 12;
    doc.moveTo(contentLeft, y).lineTo(contentLeft + pageWidth, y).strokeColor(BRAND).lineWidth(2).stroke();
    y += 18;

    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor(DARK)
      .text(`GMUD #${gmud.code}`, contentLeft, y, { continued: true })
      .font('Helvetica')
      .fontSize(16)
      .fillColor(MUTED)
      .text(` — ${gmud.title}`, { width: pageWidth });
    y = doc.y + 6;

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(BRAND)
      .text(`Status: ${STATUS_LABELS[gmud.status]}`, contentLeft, y);
    y += 22;

    drawSectionTitle('Informações gerais');
    drawKeyValueRow('Empresa', gmud.company.name, 'Responsável', gmud.responsible?.name ?? '—');
    drawKeyValueRow(
      'Criador',
      `${gmud.creator.name} (${gmud.creator.email})`,
      'Criada em',
      formatDateTime(gmud.createdAt),
    );
    drawKeyValueRow(
      'Aprovada em',
      formatDateTime(gmud.approvedAt),
      'Execução iniciada',
      formatDateTime(gmud.executionStartedAt),
    );
    drawKeyValueRow(
      'Executada em',
      formatDateTime(gmud.executedAt),
      'Atualizada em',
      formatDateTime(gmud.updatedAt),
    );

    if (gmud.description?.trim()) drawParagraph('Descrição', gmud.description);
    if (gmud.reason?.trim()) drawParagraph('Motivo', gmud.reason);
    if (gmud.impact?.trim()) drawParagraph('Impacto', gmud.impact);
    if (gmud.rollback?.trim()) drawParagraph('Plano de rollback', gmud.rollback);

    drawSectionTitle('Downtime');
    if (gmud.downtime) {
      drawKeyValueRow(
        'Haverá indisponibilidade',
        'Sim',
        'Início',
        formatDateTime(gmud.downtimeStart),
      );
      drawKeyValueRow('Fim', formatDateTime(gmud.downtimeEnd), '', '');
    } else {
      drawParagraph('Indisponibilidade', 'Não prevista para esta mudança.');
    }

    drawSectionTitle('Executores');
    if (gmud.executors.length === 0) {
      drawParagraph('Equipe', 'Nenhum executor cadastrado.');
    } else {
      for (const item of gmud.executors) {
        drawParagraph(item.user.name, item.user.email);
      }
    }

    drawSectionTitle('Aprovadores');
    if (gmud.approvers.length === 0) {
      drawParagraph('Aprovação', 'Nenhum aprovador cadastrado.');
    } else {
      for (const item of gmud.approvers) {
        const status = APPROVER_STATUS_LABELS[item.status];
        const decided = item.decidedAt ? formatDateTime(item.decidedAt) : 'Sem decisão';
        const note = item.decisionNote ? ` — ${item.decisionNote}` : '';
        drawParagraph(
          `${item.user.name} (${status})`,
          `${item.user.email}\n${decided}${note}`,
        );
      }
    }

    drawSectionTitle('Cronograma de atividades');
    if (gmud.activities.length === 0) {
      drawParagraph('Atividades', 'Nenhuma atividade cadastrada.');
    } else {
      const executorById = new Map(
        gmud.executors.map((e) => [e.user.id, e.user.name]),
      );
      for (const activity of gmud.activities) {
        const executorName = executorById.get(activity.executorUserId) ?? '—';
        drawParagraph(
          `${formatDateTime(activity.scheduledAt)} • ${activity.durationMinutes} min • ${executorName}`,
          activity.description,
        );
      }
    }

    drawSectionTitle('Anexos');
    if (gmud.attachments.length === 0) {
      drawParagraph('Arquivos', 'Nenhum anexo.');
    } else {
      for (const attachment of gmud.attachments) {
        drawParagraph(
          attachment.file.originalName,
          `Enviado por ${attachment.uploader.name} em ${formatDateTime(attachment.createdAt)} • ${formatBytes(attachment.file.size)}`,
        );
      }
    }

    ensureSpace(40);
    doc
      .moveTo(contentLeft, y)
      .lineTo(contentLeft + pageWidth, y)
      .strokeColor(BORDER)
      .lineWidth(1)
      .stroke();
    y += 12;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(MUTED)
      .text(
        `Documento gerado em ${formatDateTime(new Date())} — AlleOne • Alle Tecnologia`,
        contentLeft,
        y,
        { width: pageWidth, align: 'center' },
      );

    doc.end();

    await new Promise<void>((resolve, reject) => {
      doc.on('end', () => resolve());
      doc.on('error', reject);
    });

    const safeTitle = gmud.title
      .replace(/[^\w\s-áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ]/gi, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 40);

    return {
      buffer: Buffer.concat(chunks),
      filename: `GMUD-${gmud.code}${safeTitle ? `-${safeTitle}` : ''}.pdf`,
    };
  }
}
