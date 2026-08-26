/**
 * PM2 — Alle One (ambiente de TESTE na mesma VM)
 *
 * Portas: API 3004 | Next 3001
 * Domínio: https://alleone-teste.alletecnologia.com
 * Pasta:  /home/alleone/teste
 *
 * Uso:
 *   cd /home/alleone/teste
 *   pm2 start deploy/ecosystem.teste.config.cjs
 *   pm2 save
 *
 * Não mistura com produção (alleone-api / alleone-web).
 */
module.exports = {
  apps: [
    {
      name: "alleone-teste-api",
      cwd: "/home/alleone/teste/backend",
      script: "dist/src/main.js",
      instances: 2,
      exec_mode: "cluster",
      autorestart: true,
      kill_timeout: 20000,
      max_memory_restart: "1500M",
      env: {
        NODE_ENV: "production",
        PORT: "3004",
        // Espelho TiFlux → portal (igual produção): leitura portal_*, nada volta ao TiFlux.
        TICKETS_PORTAL_CANONICAL: "true",
        TICKETS_TIFLUX_WRITE: "false",
        TIFLUX_DISCONNECTED: "false",
        TIFLUX_RUNTIME_API: "false",
        TIFLUX_APPOINTMENT_SYNC_ENABLED: "false",
        TIFLUX_OUTBOX_DISABLED: "true",
      },
    },
    {
      name: "alleone-teste-web",
      cwd: "/home/alleone/teste/frontend",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3001 -H 0.0.0.0",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: "3001",
        // Rewrite /auth → API de teste (build tambem precisa de API_INTERNAL_URL)
        API_INTERNAL_URL: "http://127.0.0.1:3004/api",
        NEXT_PUBLIC_API_URL: "https://alleone-teste.alletecnologia.com/api",
      },
    },
  ],
};
