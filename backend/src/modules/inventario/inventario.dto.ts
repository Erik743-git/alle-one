import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export const INVENTORY_REMINDER_DAYS = [90, 30, 15, 7] as const;
export type InventoryReminderDays = (typeof INVENTORY_REMINDER_DAYS)[number];

export class InventarioCompanyIdParamDto {
  @IsUUID()
  companyId!: string;
}

export class InventarioAssetIdParamDto {
  @IsUUID()
  id!: string;
}

export class CreateInventoryAssetTypeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
}

export class CreateInventoryAssetDto {
  @IsUUID()
  assetTypeId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(INVENTORY_REMINDER_DAYS)
  reminderDaysBefore?: InventoryReminderDays;
}

export class UpdateInventoryAssetDto {
  @IsOptional()
  @IsUUID()
  assetTypeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(INVENTORY_REMINDER_DAYS)
  reminderDaysBefore?: InventoryReminderDays;

  @IsOptional()
  clearReminder?: string;

  @IsOptional()
  clearDueDate?: string;

  @IsOptional()
  removeAttachment?: string;
}

export class InventarioAttachmentQueryDto {
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  inline?: string;
}
