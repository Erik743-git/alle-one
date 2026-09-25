import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { createReadStream } from 'fs';

import { cabecalhosDeArquivo } from '../../common/http/content-disposition';
import { multerMemoryLimits } from '../../common/upload.config';
import { AuditMeta } from '../audit/audit.decorator';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  ConfigOportunidadesDto,
  ConverterOportunidadeDto,
  CriarOportunidadeDto,
  EditarOportunidadeDto,
  MoverOportunidadeDto,
  PeriodoQueryDto,
  QuadroQueryDto,
} from './oportunidades.dto';
import { OportunidadesConversaoService } from './oportunidades-conversao.service';
import { OportunidadesService } from './oportunidades.service';
import { ModuloPortal } from '../acesso/modulo-portal.decorator';

type Req = { user: AuthenticatedRequestUser };
const MAX_ARQUIVOS = 10;

/**
 * Quadro de oportunidades. Só a equipe interna entra (PJ e cliente não).
 * Quem administra (comercial ou admin) é conferido no serviço, porque
 * depende da mesa da pessoa, não só do papel.
 */
@ModuloPortal('oportunidades')
@Controller('oportunidades')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.COLLABORATOR)
export class OportunidadesController {
  constructor(
    private readonly svc: OportunidadesService,
    private readonly conversao: OportunidadesConversaoService,
  ) {}

  @Get()
  quadro(@Req() req: Req, @Query() q: QuadroQueryDto) {
    return this.svc.quadro(req.user, q);
  }

  @Get('contador')
  contador(@Req() req: Req) {
    return this.svc.contador(req.user);
  }

  @Get('ranking')
  ranking(@Req() req: Req, @Query() q: PeriodoQueryDto) {
    return this.svc.ranking(req.user, q.de, q.ate);
  }

  @Get('responsaveis')
  responsaveis(@Req() req: Req) {
    return this.svc.responsaveisPossiveis(req.user);
  }

  @Get('clientes')
  clientes(@Req() req: Req) {
    return this.svc.clientes(req.user);
  }

  @Get('pessoas')
  pessoas(@Req() req: Req) {
    return this.svc.pessoas(req.user);
  }

  @Get('config')
  @Roles(UserRole.ADMIN)
  config() {
    return this.svc.config();
  }

  @Put('config')
  @Roles(UserRole.ADMIN)
  salvarConfig(@Body() body: ConfigOportunidadesDto) {
    return this.svc.salvarConfig(body);
  }

  @Get(':id')
  obter(@Req() req: Req, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.obter(req.user, id);
  }

  @Post()
  @UseInterceptors(
    FilesInterceptor('arquivos', MAX_ARQUIVOS, multerMemoryLimits),
  )
  @AuditMeta({ entity: 'Oportunidade', action: 'CREATE' })
  criar(
    @Req() req: Req,
    @Body() body: CriarOportunidadeDto,
    @UploadedFiles() arquivos: Express.Multer.File[] = [],
  ) {
    return this.svc.criarPeloPortal(req.user, body, arquivos);
  }

  @Patch(':id')
  @AuditMeta({ entity: 'Oportunidade', action: 'UPDATE', entityIdParam: 'id' })
  editar(
    @Req() req: Req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: EditarOportunidadeDto,
  ) {
    return this.svc.editar(req.user, id, body);
  }

  @Post(':id/mover')
  @AuditMeta({ entity: 'Oportunidade', action: 'MOVE', entityIdParam: 'id' })
  mover(
    @Req() req: Req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MoverOportunidadeDto,
  ) {
    return this.svc.mover(req.user, id, body);
  }

  @Get(':id/mesas')
  mesas(@Req() req: Req, @Param('id', ParseUUIDPipe) id: string) {
    return this.conversao.mesas(req.user, id);
  }

  @Post(':id/converter')
  @AuditMeta({ entity: 'Oportunidade', action: 'CONVERT', entityIdParam: 'id' })
  converter(
    @Req() req: Req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ConverterOportunidadeDto,
  ) {
    if (body.destino === 'CHAMADO') {
      if (!body.deskId)
        throw new BadRequestException('Escolha a mesa do chamado.');
      return this.conversao.converter(req.user, id, {
        destino: 'CHAMADO',
        deskId: body.deskId,
      });
    }
    if (!body.budgetUnit || !body.budgetAmount) {
      throw new BadRequestException('Informe o orçamento do projeto.');
    }
    return this.conversao.converter(req.user, id, {
      destino: 'PROJETO',
      budgetUnit: body.budgetUnit,
      budgetAmount: body.budgetAmount,
      ticketNumber: body.ticketNumber,
    });
  }

  @Post(':id/reabrir')
  @AuditMeta({ entity: 'Oportunidade', action: 'REOPEN', entityIdParam: 'id' })
  reabrir(@Req() req: Req, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.reabrir(req.user, id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @AuditMeta({ entity: 'Oportunidade', action: 'DELETE', entityIdParam: 'id' })
  apagar(@Req() req: Req, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.apagar(req.user, id);
  }

  @Post(':id/anexos')
  @UseInterceptors(
    FilesInterceptor('arquivos', MAX_ARQUIVOS, multerMemoryLimits),
  )
  @AuditMeta({ entity: 'Oportunidade', action: 'ATTACH', entityIdParam: 'id' })
  anexar(
    @Req() req: Req,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() arquivos: Express.Multer.File[] = [],
  ) {
    return this.svc.anexar(req.user, id, arquivos);
  }

  @Delete(':id/anexos/:anexoId')
  @AuditMeta({ entity: 'Oportunidade', action: 'DETACH', entityIdParam: 'id' })
  removerAnexo(
    @Req() req: Req,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('anexoId', ParseUUIDPipe) anexoId: string,
  ) {
    return this.svc.removerAnexo(req.user, id, anexoId);
  }

  @Get(':id/anexos/:anexoId')
  async baixarAnexo(
    @Req() req: Req,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('anexoId', ParseUUIDPipe) anexoId: string,
    @Query('inline') inline: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.svc.arquivoDoAnexo(req.user, id, anexoId);
    const cabecalhos = cabecalhosDeArquivo({
      mimeType: file.mimeType,
      originalName: file.originalName,
      inline: inline === 'true',
    });
    for (const [nome, valor] of Object.entries(cabecalhos))
      res.setHeader(nome, valor);
    return new StreamableFile(createReadStream(file.path));
  }
}
