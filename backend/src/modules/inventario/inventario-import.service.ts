import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  INVENTORY_REMINDER_DAYS,
} from './inventario.dto';
import {
  INVENTORY_DEFAULT_SUPPLIER,
  InventarioService,
} from './inventario.service';

const IMPORT_HEADERS = [
  'Tipo',
  'Marca',
  'Quantidade',
  'Fornecedor',
  'Fornecedor terceiro',
  'Descrição',
  'Vencimento',
  'Lembrete',
] as const;

type ImportRowError = { row: number; message: string };

@Injectable()
export class InventarioImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventario: InventarioService,
  ) {}

  async buildTemplateBuffer(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Alle One';

    const instructions = workbook.addWorksheet('Instruções');
    instructions.addRow(['Como importar inventário']);
    instructions.addRow([
      '1. Preencha a aba Ativos. A coluna Tipo é obrigatória (tipos novos são criados automaticamente).',
    ]);
    instructions.addRow([
      '2. Fornecedor terceiro: Sim/Não. Se Não, o fornecedor padrão Alle Tecnologia será usado.',
    ]);
    instructions.addRow([
      '3. Vencimento: AAAA-MM-DD ou DD/MM/AAAA. Lembrete: 90, 30, 15 ou 7 (dias antes).',
    ]);
    instructions.addRow(['4. Linhas em branco ou sem Tipo são ignoradas.']);
    instructions.getColumn(1).width = 96;

    const sheet = workbook.addWorksheet('Ativos');
    sheet.addRow([...IMPORT_HEADERS]);
    sheet.getRow(1).font = { bold: true };
    IMPORT_HEADERS.forEach((_, index) => {
      sheet.getColumn(index + 1).width = index === 5 ? 40 : 18;
    });
    sheet.addRow([
      'Ex.: Firewall',
      'Fortinet',
      '2',
      '',
      'Não',
      'Firewall de borda',
      '2026-12-31',
      '30',
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async importFromBuffer(params: {
    user: AuthenticatedRequestUser;
    companyId: string;
    buffer: Buffer;
  }): Promise<{ created: number; errors: ImportRowError[] }> {
    await this.inventario.assertCompanyScopeForImport(
      params.user,
      params.companyId,
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      Buffer.from(params.buffer) as unknown as ExcelJS.Buffer,
    );

    const sheet =
      workbook.getWorksheet('Ativos') ??
      workbook.worksheets.find((ws) => ws.rowCount > 0) ??
      null;
    if (!sheet) {
      throw new BadRequestException('Planilha vazia ou sem aba de ativos.');
    }

    const headerRow = sheet.getRow(1);
    const columnIndex = this.resolveColumns(headerRow);
    if (columnIndex.tipo == null) {
      throw new BadRequestException(
        'Cabeçalho inválido. A coluna "Tipo" é obrigatória.',
      );
    }

    const typeCache = new Map<string, { id: string; name: string }>();
    let created = 0;
    const errors: ImportRowError[] = [];

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const tipo = this.cellText(row, columnIndex.tipo);
      if (!tipo) continue;

      try {
        const assetType = await this.resolveAssetTypeByName(tipo, typeCache);
        const thirdPartyRaw = this.cellText(row, columnIndex.fornecedorTerceiro);
        const supplierRaw = this.cellText(row, columnIndex.fornecedor);
        const { supplierThirdParty, supplier } = this.resolveSupplier(
          thirdPartyRaw,
          supplierRaw,
        );
        const dueDate = this.parseDueDate(
          this.cellText(row, columnIndex.vencimento),
        );
        const reminderDaysBefore = this.parseReminder(
          this.cellText(row, columnIndex.lembrete),
        );
        if (reminderDaysBefore != null && !dueDate) {
          throw new BadRequestException(
            'Informe vencimento para usar lembrete.',
          );
        }

        const quantityRaw = this.cellText(row, columnIndex.quantidade);
        const quantity =
          quantityRaw === ''
            ? null
            : this.parseQuantity(quantityRaw, rowNumber);

        await this.prisma.inventoryAsset.create({
          data: {
            companyId: params.companyId,
            assetTypeId: assetType.id,
            name: assetType.name,
            brand: this.cellText(row, columnIndex.marca) || null,
            quantity,
            supplier,
            supplierThirdParty,
            description:
              this.cellText(row, columnIndex.descricao) || null,
            dueDate,
            reminderDaysBefore,
            createdBy: params.user.userId,
          },
        });
        created += 1;
      } catch (err) {
        errors.push({
          row: rowNumber,
          message:
            err instanceof Error ? err.message : 'Erro ao importar linha.',
        });
      }
    }

    if (created > 0) {
      await this.audit.log({
        actor: params.user,
        action: 'CREATE',
        entity: 'InventoryAsset',
        entityId: params.companyId,
        payload: {
          import: true,
          created,
          errors: errors.length,
        },
      });
    }

    return { created, errors };
  }

  private resolveColumns(headerRow: ExcelJS.Row) {
    const map = new Map<string, number>();
    headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
      const key = this.normalizeHeader(String(cell.value ?? ''));
      if (key) map.set(key, col);
    });

    const col = (aliases: string[]) => {
      for (const alias of aliases) {
        const found = map.get(this.normalizeHeader(alias));
        if (found != null) return found;
      }
      return null;
    };

    return {
      tipo: col(['tipo', 'type', 'asset type', 'tipo de ativo']),
      marca: col(['marca', 'brand']),
      quantidade: col(['quantidade', 'qty', 'quantity']),
      fornecedor: col(['fornecedor', 'supplier']),
      fornecedorTerceiro: col([
        'fornecedor terceiro',
        'fornecedor_terceiro',
        'terceiro',
      ]),
      descricao: col(['descricao', 'descrição', 'description']),
      vencimento: col(['vencimento', 'due date', 'data vencimento']),
      lembrete: col(['lembrete', 'reminder', 'dias lembrete']),
    };
  }

  private normalizeHeader(value: string) {
    return value
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .trim()
      .toLowerCase();
  }

  private cellText(row: ExcelJS.Row, column?: number | null) {
    if (column == null) return '';
    const cell = row.getCell(column);
    return this.formatCellValue(cell.value).trim();
  }

  private formatCellValue(value: ExcelJS.CellValue): string {
    if (value == null) return '';
    if (value instanceof Date) {
      const y = value.getFullYear();
      const m = String(value.getMonth() + 1).padStart(2, '0');
      const d = String(value.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    if (typeof value === 'object' && 'result' in (value as object)) {
      return this.formatCellValue((value as ExcelJS.CellFormulaValue).result);
    }
    if (typeof value === 'object' && 'richText' in (value as object)) {
      return (value as ExcelJS.CellRichTextValue).richText
        .map((part) => part.text)
        .join('');
    }
    return String(value);
  }

  private parseQuantity(raw: string, row: number): number | null {
    const n = Number(raw.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      throw new BadRequestException(
        `Linha ${row}: quantidade inválida "${raw}".`,
      );
    }
    return n;
  }

  private parseBoolean(raw: string) {
    const normalized = raw.trim().toLowerCase();
    return (
      normalized === 'sim' ||
      normalized === 's' ||
      normalized === 'true' ||
      normalized === '1' ||
      normalized === 'yes'
    );
  }

  private resolveSupplier(thirdPartyRaw: string, supplierRaw: string) {
    const thirdParty = this.parseBoolean(thirdPartyRaw);
    if (!thirdParty) {
      return {
        supplierThirdParty: false,
        supplier: INVENTORY_DEFAULT_SUPPLIER,
      };
    }
    const supplier = supplierRaw.trim();
    if (!supplier) {
      throw new BadRequestException(
        'Fornecedor terceiro marcado como Sim, mas Fornecedor está vazio.',
      );
    }
    return { supplierThirdParty: true, supplier };
  }

  private parseDueDate(raw: string): Date | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const parsed = new Date(`${trimmed}T12:00:00`);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException(`Vencimento inválido: ${trimmed}`);
      }
      return parsed;
    }

    const br = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (br) {
      const [, dd, mm, yyyy] = br;
      const parsed = new Date(
        `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T12:00:00`,
      );
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException(`Vencimento inválido: ${trimmed}`);
      }
      return parsed;
    }

    const asDate = new Date(trimmed);
    if (!Number.isNaN(asDate.getTime())) {
      return new Date(
        `${asDate.getFullYear()}-${String(asDate.getMonth() + 1).padStart(2, '0')}-${String(asDate.getDate()).padStart(2, '0')}T12:00:00`,
      );
    }

    throw new BadRequestException(`Vencimento inválido: ${trimmed}`);
  }

  private parseReminder(raw: string): number | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/(\d+)/);
    if (!match) {
      throw new BadRequestException(`Lembrete inválido: ${trimmed}`);
    }
    const days = Number(match[1]);
    if (!INVENTORY_REMINDER_DAYS.includes(days as (typeof INVENTORY_REMINDER_DAYS)[number])) {
      throw new BadRequestException(
        'Lembrete inválido. Use 90, 30, 15 ou 7 dias antes.',
      );
    }
    return days;
  }

  private async resolveAssetTypeByName(
    name: string,
    cache: Map<string, { id: string; name: string }>,
  ) {
    const key = name.trim().toLowerCase();
    const cached = cache.get(key);
    if (cached) return cached;

    const existing = await this.prisma.inventoryAssetType.findFirst({
      where: {
        deletedAt: null,
        name: { equals: name.trim(), mode: 'insensitive' },
      },
      select: { id: true, name: true },
    });
    if (existing) {
      cache.set(key, existing);
      return existing;
    }

    const created = await this.prisma.inventoryAssetType.create({
      data: { name: name.trim() },
      select: { id: true, name: true },
    });
    cache.set(key, created);
    return created;
  }
}
