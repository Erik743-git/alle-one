import { SetMetadata } from '@nestjs/common';

export const AUDIT_META_KEY = 'alleone:auditMeta';

export type AuditMetaOptions = {
  /** Nome lógico da entidade (ex.: User, Company, InventoryAsset). */
  entity: string;
  /** Ação lógica (ex.: CREATE, UPDATE, DELETE, APPROVE). */
  action?: string;
  /** Nome do param que contém o ID (ex.: id, userId, companyId). */
  entityIdParam?: string;
};

export const AuditMeta = (options: AuditMetaOptions) =>
  SetMetadata(AUDIT_META_KEY, options);
