import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

import type { ProjectHistoryDto } from './projetos.service';

const BRAND = '#0ea5c6';
const DARK = '#0f172a';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function safeFilenamePart(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

@Injectable()
export class ProjetosHistoryPdfService {
  async build(params: {
    projectCode: number;
    projectName: string;
    companyName: string;
    events: ProjectHistoryDto[];
  }): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const finished = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    doc
      .fillColor(BRAND)
      .fontSize(20)
      .text('Histórico do projeto', { align: 'left' });
    doc.moveDown(0.4);
    doc
      .fillColor(DARK)
      .fontSize(12)
      .text(`#${params.projectCode} — ${params.projectName}`);
    doc.fillColor(MUTED).fontSize(10).text(params.companyName);
    doc.moveDown(0.6);
    doc.strokeColor(BORDER).moveTo(48, doc.y).lineTo(547, doc.y).stroke();
    doc.moveDown(0.8);

    doc
      .fillColor(MUTED)
      .fontSize(9)
      .text(`Gerado em ${formatDateTime(new Date().toISOString())}`);
    doc.fillColor(MUTED).fontSize(9).text(`${params.events.length} evento(s)`);
    doc.moveDown(1);

    if (!params.events.length) {
      doc.fillColor(MUTED).fontSize(11).text('Nenhum evento registrado.');
    } else {
      for (const event of params.events) {
        if (doc.y > 720) {
          doc.addPage();
        }

        doc.fillColor(DARK).fontSize(10).text(formatDateTime(event.createdAt), {
          continued: false,
        });
        doc.fillColor(BRAND).fontSize(10).text(event.summary, { width: 500 });
        if (event.actorName) {
          doc.fillColor(MUTED).fontSize(9).text(`por ${event.actorName}`);
        }
        doc.moveDown(0.8);
        doc.strokeColor(BORDER).moveTo(48, doc.y).lineTo(547, doc.y).stroke();
        doc.moveDown(0.6);
      }
    }

    doc.end();
    const buffer = await finished;

    const suffix = safeFilenamePart(params.projectName) || 'projeto';
    return {
      buffer,
      filename: `historico-projeto-${params.projectCode}-${suffix}.pdf`,
      mimeType: 'application/pdf',
    };
  }
}
