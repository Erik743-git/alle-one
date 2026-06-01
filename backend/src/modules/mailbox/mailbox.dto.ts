import { IsOptional, IsUUID } from 'class-validator';

export class MarkMailboxReadDto {
  @IsOptional()
  @IsUUID()
  id?: string;
}
