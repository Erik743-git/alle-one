"use client";

import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Estado de erro de carregamento.
 *
 * Sem isto a tela cai no estado vazio ("Nenhuma empresa encontrada") quando a
 * requisição falha: o toast some em segundos e quem chega depois conclui que o
 * cadastro sumiu. Renderize no lugar da lista, antes da checagem de vazio.
 */
export function LoadErrorState({
  title = "Não foi possível carregar os dados.",
  message,
  onRetry,
}: {
  title?: string;
  message?: string | null;
  onRetry: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {message ? (
          <p className="max-w-md text-sm text-muted-foreground">{message}</p>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-2 size-4" />
          Tentar de novo
        </Button>
      </CardContent>
    </Card>
  );
}
