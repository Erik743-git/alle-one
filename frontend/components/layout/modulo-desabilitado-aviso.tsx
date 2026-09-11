"use client";

import { Construction } from "lucide-react";

/**
 * Tela mostrada no lugar de um módulo desligado em produção.
 *
 * Esconder só no menu não basta: a rota continua acessível por URL digitada ou
 * por link antigo salvo pelo usuário. Aqui a página responde de forma honesta,
 * dizendo que está em revisão, em vez de carregar dados de um módulo que a
 * empresa decidiu não usar por enquanto.
 */
export function ModuloDesabilitadoAviso({ nome }: { nome: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md rounded-xl border border-border bg-card px-6 py-8 text-center">
        <Construction className="mx-auto size-10 text-muted-foreground" />
        <h1 className="mt-4 text-lg font-semibold text-foreground">
          {nome} em revisão
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Este módulo está temporariamente indisponível enquanto passa por
          reavaliação. Nenhum dado foi removido.
        </p>
      </div>
    </div>
  );
}
