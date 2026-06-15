module.exports = {
  apps: [
    {
      name: 'alleone-api',
      cwd: '/home/alleone/producao/backend',
      script: 'dist/src/main.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '800M',
      env: {
        NODE_ENV: 'production',
        TIFLUX_OUTBOX_DISABLED: 'true',
      },
    },
    {
      name: 'alleone-web',
      cwd: '/home/alleone/producao/frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      instances: 1,
      autorestart: true,
      max_memory_restart: '600M',
    },
    {
      name: 'alleone-outbox',
      cwd: '/home/alleone/producao/backend',
      script: 'dist/src/workers/outbox-runner.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '400M',
    },
  ],
};
