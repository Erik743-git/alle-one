import { Logger } from '@nestjs/common';

/**
 * Impede a API de subir apontada para o banco errado.
 *
 * Em 19/09/2026 a API de teste subiu ligada ao banco de produção: quem deu o
 * start tinha exportado o `DATABASE_URL` de produção no próprio shell, e o
 * PM2 passou essa variável adiante — o `.env` do ambiente não sobrescreve o
 * que já existe no processo. Nada foi corrompido por sorte (nenhuma rotina
 * estava vencida naquele momento), mas a API de teste escrevendo em produção
 * é um acidente sério esperando para acontecer.
 *
 * Cada ambiente declara `ALLEONE_EXPECTED_DB` no seu arquivo do PM2; se o
 * banco da conexão não for esse, o processo morre com a mensagem em vez de
 * atender pedidos no lugar errado.
 */
export function assertExpectedDatabase(
  logger = new Logger('DatabaseGuard'),
): void {
  const esperado = process.env.ALLEONE_EXPECTED_DB?.trim();
  if (!esperado) return;

  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    logger.error('DATABASE_URL não definida. A API não vai subir.');
    process.exit(1);
  }

  const atual = nomeDoBanco(url);
  if (atual === esperado) {
    logger.log(`Banco conferido: ${atual}.`);
    return;
  }

  logger.error(
    `Banco errado: a configuração deste ambiente espera "${esperado}" e a ` +
      `conexão aponta para "${atual ?? 'desconhecido'}". A API não vai subir. ` +
      'Verifique se alguém exportou DATABASE_URL no shell antes do start.',
  );
  process.exit(1);
}

/** Último trecho do caminho da URL, sem a query string. */
export function nomeDoBanco(url: string): string | null {
  const semQuery = url.split('?')[0];
  const barra = semQuery.lastIndexOf('/');
  if (barra < 0) return null;
  const nome = semQuery.slice(barra + 1).trim();
  return nome || null;
}
