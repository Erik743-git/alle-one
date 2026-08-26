/**
 * Em PM2 cluster (NODE_APP_INSTANCE=0,1,…), jobs agendados devem rodar só na instância 0.
 * Em fork/dev (variável ausente), mantém comportamento atual.
 */
export function shouldRunScheduledJobs(): boolean {
  const instance = process.env.NODE_APP_INSTANCE;
  if (instance === undefined || instance === '') {
    return true;
  }
  return instance === '0';
}
