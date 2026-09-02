/**
 * PM2 — Alle One (produção na VM)
 *
 * API em cluster (2 workers) para usar mais de um núcleo de CPU.
 * Jobs @Cron rodam só na instância 0 (shouldRunScheduledJobs).
 *
 * Uso:
 *   cd /home/alleone/producao
 *   pm2 delete alleone-api 2>/dev/null || true
 *   pm2 start deploy/ecosystem.config.cjs --only alleone-api
 *   pm2 save
 */
module.exports = {
  apps: [
    {
      name: "alleone-api",
      cwd: "/home/alleone/producao/backend",
      script: "dist/src/main.js",
      instances: 2,
      exec_mode: "cluster",
      autorestart: true,
      max_memory_restart: "1500M",
      kill_timeout: 20000,
      env: {
        NODE_ENV: "production",
        PORT: "3002",
      },
    },
    {
      name: "alleone-web",
      cwd: "/home/alleone/producao/frontend",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000 -H 0.0.0.0",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        // Rewrites Next + proxy /auth: loopback (evita hairpin Cloudflare em produção).
        API_INTERNAL_URL: "http://127.0.0.1:3002/api",
      },
    },
    {
      name: "alleone-zabbix-sync",
      cwd: "/home/alleone/alleone-zabbix-sync",
      script: "dist/main.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: "3031",
      },
    },
    {
      name: "alleone-tiflux-sync",
      cwd: "/home/alleone/producao/alleone-tiflux-sync",
      script: "dist/main.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: "3003",
      },
    },
