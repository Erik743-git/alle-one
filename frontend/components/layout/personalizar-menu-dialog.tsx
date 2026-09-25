"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Construction, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/use-auth";
import { notifyError, notifySuccess } from "@/lib/notify";
import { menuService } from "@/lib/services/menu.service";
import { cn } from "@/lib/utils";

export type ItemDoPersonalizar = {
  chave: string;
  nome: string;
  icon: React.ComponentType<{ className?: string }>;
  visivel: boolean;
  emConstrucao: boolean;
};

/**
 * Personalizar menu: esconder e reordenar os itens da lateral. Só mostra o
 * que a pessoa já acessa; "Novo ticket" e Administração ficam de fora (fixos).
 * Setas para reordenar: funcionam no teclado, no leitor de tela e no toque.
 */
export function PersonalizarMenuDialog({
  aberto,
  onFechar,
  itens,
}: {
  aberto: boolean;
  onFechar: () => void;
  itens: ItemDoPersonalizar[];
}) {
  const { refreshUser } = useAuth();
  const [lista, setLista] = useState(itens);
  const [salvando, setSalvando] = useState(false);

  function mover(i: number, delta: number) {
    setLista((atual) => {
      const j = i + delta;
      if (j < 0 || j >= atual.length) return atual;
      const copia = [...atual];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });
  }

  async function executar(acao: () => Promise<unknown>, mensagem: string) {
    setSalvando(true);
    try {
      await acao();
      await refreshUser();
      notifySuccess(mensagem);
      onFechar();
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível salvar.",
      );
    } finally {
      setSalvando(false);
    }
  }

  const visiveis = lista.filter((i) => i.visivel).length;

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && !salvando && onFechar()}>
      <DialogContent className="flex max-h-[min(90vh,680px)] flex-col gap-0 p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 space-y-1 px-5 pb-3 pt-5 pr-12">
          <DialogTitle>Personalizar menu</DialogTitle>
          <DialogDescription>
            Escolha o que aparece na lateral e em que ordem. Esconder não tira o
            acesso: o módulo continua abrindo por link, busca ou guia.
          </DialogDescription>
        </DialogHeader>
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto border-y border-border px-5">
          {lista.map((item, i) => {
            const Icon = item.icon;
            return (
              <li key={item.chave} className="flex items-center gap-3 py-2.5">
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    !item.visivel && "opacity-40",
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm",
                    !item.visivel && "text-muted-foreground",
                  )}
                >
                  {item.nome}
                  {item.emConstrucao ? (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 align-middle text-[11px] font-medium text-amber-700 dark:text-amber-300">
                      <Construction className="size-3" aria-hidden />
                      Em construção
                    </span>
                  ) : null}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={i === 0 || salvando}
                    aria-label={`Subir ${item.nome}`}
                    onClick={() => mover(i, -1)}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={i === lista.length - 1 || salvando}
                    aria-label={`Descer ${item.nome}`}
                    onClick={() => mover(i, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Switch
                    checked={item.visivel}
                    disabled={salvando}
                    aria-label={`Mostrar ${item.nome} no menu`}
                    onCheckedChange={(v) =>
                      setLista((atual) =>
                        atual.map((x) =>
                          x.chave === item.chave ? { ...x, visivel: v } : x,
                        ),
                      )
                    }
                  />
                </div>
              </li>
            );
          })}
        </ul>
        {/* bleed=false: o DialogContent daqui é p-0, então não há padding para
            cancelar — com o padrão a barra descia 16px e o Salvar colava na borda. */}
        <DialogFooter
          bleed={false}
          className="shrink-0 gap-2 px-5 py-4 sm:justify-between sm:gap-0"
        >
          <Button
            type="button"
            variant="ghost"
            disabled={salvando}
            onClick={() =>
              void executar(
                () => menuService.voltarAoPadrao(),
                "Menu voltou ao padrão.",
              )
            }
          >
            Voltar ao padrão
          </Button>
          <Button
            type="button"
            disabled={salvando}
            onClick={() =>
              void executar(
                () =>
                  menuService.salvar({
                    ordem: lista.map((i) => i.chave),
                    visivel: Object.fromEntries(
                      lista.map((i) => [i.chave, i.visivel]),
                    ),
                  }),
                visiveis
                  ? "Menu salvo."
                  : "Menu salvo. Todos os itens ficaram escondidos.",
              )
            }
          >
            {salvando ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
