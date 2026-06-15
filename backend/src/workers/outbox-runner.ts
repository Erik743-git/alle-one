import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { OutboxWorkerModule } from './outbox-worker.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('OutboxRunner');
  await NestFactory.createApplicationContext(OutboxWorkerModule, {
    logger: ['error', 'warn', 'log'],
  });
  logger.log(
    'Processo outbox ativo (cron 1/min). Encerre com SIGINT/SIGTERM.',
  );
}

void bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
