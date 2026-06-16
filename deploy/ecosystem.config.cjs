/**
 * PM2 — Alle One (produção na VM)
 *
 * Uso:
 *   cd /home/alleone/producao
 *   pm2 start deploy/ecosystem.config.cjs
 *   pm2 save
 */
module.exports = {
  apps: [
    {
      name: "alleone-api",
      cwd: "/home/alleone/producao/backend",
      script: "dist/src/main.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "800M",
      env: {
        NODE_ENV: "production",
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
  ],
};
