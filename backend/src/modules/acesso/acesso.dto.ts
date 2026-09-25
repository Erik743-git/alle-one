import { IsBoolean, IsString, MaxLength } from 'class-validator';

export class SalvarAcessoModuloDto {
  @IsString()
  @MaxLength(60)
  chave!: string;

  @IsBoolean()
  emConstrucao!: boolean;

  @IsBoolean()
  colaborador!: boolean;

  @IsBoolean()
  terceiro!: boolean;

  @IsBoolean()
  clienteGestor!: boolean;

  @IsBoolean()
  clienteMembro!: boolean;
}
