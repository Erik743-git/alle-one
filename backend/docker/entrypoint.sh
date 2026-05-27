#!/usr/bin/env sh
set -eu

echo "Aplicando migrations do Prisma (deploy)…"
npx prisma migrate deploy

echo "Iniciando API…"
node dist/src/main

