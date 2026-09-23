import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, readdir, rename, rm } from 'fs/promises';
import { basename, dirname, extname, join } from 'path';
import { promisify } from 'util';

const run = promisify(execFile);

/**
 * Converte o arquivo do relatório em PDF, para visualizar sem baixar.
 *
 * Renderiza o MESMO arquivo que a pessoa baixaria, então cor, coluna e
 * gráfico saem idênticos — e vale para qualquer tipo de relatório, hoje e os
 * que vierem, sem código por tipo.
 *
 * O PDF é gravado ao lado do original e reaproveitado: o relatório não muda
 * depois de gerado, então converter uma vez basta.
 */
@Injectable()
export class ReportPdfPreviewService {
  private readonly logger = new Logger(ReportPdfPreviewService.name);
  private disponivel: boolean | null = null;

  /** Binário do LibreOffice. Varia por distribuição, daí a lista. */
  private binarios(): string[] {
    const doAmbiente = process.env.LIBREOFFICE_BIN?.trim();
    return [
      ...(doAmbiente ? [doAmbiente] : []),
      'soffice',
      'libreoffice',
      '/usr/bin/soffice',
      '/usr/bin/libreoffice',
      '/snap/bin/libreoffice',
    ];
  }

  private async binarioUsavel(): Promise<string | null> {
    for (const bin of this.binarios()) {
      try {
        await run(bin, ['--version'], { timeout: 20_000 });
        return bin;
      } catch {
        continue;
      }
    }
    return null;
  }

  /** Para a tela esconder o botão em vez de oferecer algo que vai falhar. */
  async estaDisponivel(): Promise<boolean> {
    if (this.disponivel !== null) return this.disponivel;
    this.disponivel = (await this.binarioUsavel()) !== null;
    if (!this.disponivel) {
      this.logger.warn(
        'LibreOffice não encontrado: a visualização em PDF fica indisponível. ' +
          'Instale o libreoffice-calc ou aponte LIBREOFFICE_BIN.',
      );
    }
    return this.disponivel;
  }

  /**
   * Caminho do PDF do arquivo informado, convertendo na primeira vez.
   * O `.pdf` fica na mesma pasta do original.
   */
  async caminhoDoPdf(origem: string): Promise<string> {
    const destino = join(
      dirname(origem),
      `${basename(origem, extname(origem))}.pdf`,
    );
    if (existsSync(destino)) return destino;

    const bin = await this.binarioUsavel();
    if (!bin) {
      throw new ServiceUnavailableException(
        'Visualização indisponível neste servidor: o conversor de PDF não está instalado.',
      );
    }

    // Pasta própria por conversão: o LibreOffice escolhe o nome de saída, e
    // duas conversões simultâneas na mesma pasta se atrapalham.
    const temp = join(dirname(origem), `.pdf-${Date.now()}`);
    await mkdir(temp, { recursive: true });
    try {
      await run(
        bin,
        [
          '--headless',
          '--norestore',
          // Perfil próprio: sem isto o LibreOffice reclama quando duas
          // conversões rodam ao mesmo tempo.
          `-env:UserInstallation=file://${temp}/perfil`,
          '--convert-to',
          'pdf:calc_pdf_Export',
          '--outdir',
          temp,
          origem,
        ],
        { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
      );

      const gerados = (await readdir(temp)).filter((f) =>
        f.toLowerCase().endsWith('.pdf'),
      );
      if (gerados.length === 0) {
        throw new Error('conversão não produziu PDF');
      }
      await rename(join(temp, gerados[0]), destino);
      return destino;
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Falha ao converter ${basename(origem)}: ${motivo}`);
      throw new ServiceUnavailableException(
        'Não foi possível preparar a visualização deste relatório.',
      );
    } finally {
      await rm(temp, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
