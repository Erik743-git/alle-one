"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Info, RefreshCw } from "lucide-react";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import AppShell from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  grafanaService,
  type GrafanaBoard,
} from "@/lib/services/grafana.service";

/** Um quadro por painel publicado: o Grafana desenha dentro dele. */
function BoardFrame({ board, versao }: { board: GrafanaBoard; versao: number }) {
  const [carregando, setCarregando] = useState(true);

  // "Atualizar" troca a chave do quadro, o que recarrega o painel.
  useEffect(() => {
    setCarregando(true);
  }, [versao]);

  return (
    <Card className="overflow-hidden border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="truncate text-sm font-semibold text-foreground">
          {board.title}
        </h2>
      </div>
      <div className="relative h-[560px] w-full bg-muted/20">
        {carregando ? (
          <div className="absolute inset-0 animate-pulse bg-muted/40" />
        ) : null}
        <iframe
          key={`${board.id}-${versao}`}
          src={board.url}
          title={board.title}
          className="h-full w-full border-0"
          loading="lazy"
          // O painel é só leitura: nada de formulário, navegação ou pop-up
          // partindo de dentro do quadro.
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="no-referrer"
          onLoad={() => setCarregando(false)}
        />
      </div>
    </Card>
  );
}

function Aviso({
  tom,
  titulo,
  children,
}: {
  tom: "info" | "alerta" | "erro";
  titulo: string;
  children: React.ReactNode;
}) {
  const cor =
    tom === "erro"
      ? "border-destructive/40 bg-destructive/5"
      : tom === "alerta"
        ? "border-amber-500/40 bg-amber-500/5"
        : "border-border bg-muted/20";
  const Icone = tom === "info" ? Info : AlertCircle;
  const corIcone =
    tom === "erro"
      ? "text-destructive"
      : tom === "alerta"
        ? "text-amber-400"
        : "text-primary";

  return (
    <Card className={`border ${cor}`}>
      <CardContent className="flex items-start gap-3 p-5">
        <Icone className={`mt-0.5 size-5 shrink-0 ${corIcone}`} />
        <div className="space-y-1">
          <p className="font-semibold text-foreground">{titulo}</p>
          <div className="text-sm text-muted-foreground">{children}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function MonitoramentoPageImpl() {
  const [boards, setBoards] = useState<GrafanaBoard[]>([]);
  const [configurado, setConfigurado] = useState(true);
  const [demo, setDemo] = useState(false);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [versao, setVersao] = useState(0);

  const carregar = useCallback(async () => {
    try {
      setCarregando(true);
      setErro("");
      const res = await grafanaService.listBoards();
      setBoards(res.boards);
      setConfigurado(res.configured);
      setDemo(res.demo);
      setOrgName(res.orgName);
    } catch (err) {
      setErro(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar os painéis.",
      );
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const semPaineis =
    !carregando && !erro && configurado && boards.length === 0;

  return (
    <ProtectedPage>
      <PermissionGate module="MONITORING">
        <AppShell>
          <div className="font-sans w-full space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <h1 className="text-3xl font-bold text-foreground">
                  Monitoramento
                </h1>
                <p className="text-muted-foreground">
                  {orgName
                    ? `Painéis de ${orgName}, ao vivo, sem sair do portal.`
                    : "Painéis de monitoramento ao vivo, sem sair do portal."}
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => setVersao((v) => v + 1)}
                disabled={carregando || boards.length === 0}
              >
                <RefreshCw className="mr-2 size-3.5" />
                Atualizar
              </Button>
            </div>

            {!configurado ? (
              <Aviso tom="alerta" titulo="Integração não configurada">
                Falta o endereço do Grafana na configuração do servidor. Os
                painéis aparecem assim que for configurado.
              </Aviso>
            ) : null}

            {demo && boards.length > 0 ? (
              <Aviso tom="info" titulo="Você está vendo uma demonstração">
                Estes painéis usam dados de exemplo. Com o monitoramento
                contratado, esta tela mostra os dados do seu ambiente.
              </Aviso>
            ) : null}

            {erro ? (
              <Aviso tom="erro" titulo="Não foi possível carregar">
                <p>{erro}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => void carregar()}
                >
                  Tentar de novo
                </Button>
              </Aviso>
            ) : null}

            {carregando ? (
              <div className="h-[560px] animate-pulse rounded-2xl bg-muted/40" />
            ) : null}

            {semPaineis ? (
              <Aviso tom="info" titulo="Nenhum painel publicado ainda">
                Quando houver painéis publicados para a sua empresa no Grafana,
                eles aparecem aqui automaticamente.
              </Aviso>
            ) : null}

            <div className="grid grid-cols-1 gap-6">
              {boards.map((board) => (
                <BoardFrame key={board.id} board={board} versao={versao} />
              ))}
            </div>
          </div>
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}

export { MonitoramentoPageImpl as PortalPageComponent };
