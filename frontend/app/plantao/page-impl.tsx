"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CalendarClock, Info, RefreshCw } from "lucide-react";
import ProtectedPage from "@/components/auth/protected-page";
import AppShell from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  plantaoService,
  type EscalaPlantao,
  type PlantaoResposta,
  type TurnoPlantao,
} from "@/lib/services/plantao.service";

const DIA_SEMANA = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
];

/** "2026-09-19T18:00:00.0000000" já vem no horário de Brasília. */
function paraData(valor: string): Date | null {
  const d = new Date(valor.replace(/\.\d+$/, ""));
  return Number.isNaN(d.getTime()) ? null : d;
}

function rotuloPeriodo(turno: TurnoPlantao): string {
  const inicio = paraData(turno.inicio);
  const fim = paraData(turno.fim);
  if (!inicio || !fim) return "";

  const dd = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  const hh = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  const mesmoDia = dd(inicio) === dd(fim);
  return mesmoDia
    ? `${DIA_SEMANA[inicio.getDay()]} ${dd(inicio)}, ${hh(inicio)} – ${hh(fim)}`
    : `${DIA_SEMANA[inicio.getDay()]} ${dd(inicio)} ${hh(inicio)} → ${DIA_SEMANA[fim.getDay()]} ${dd(fim)} ${hh(fim)}`;
}

function desdeQuando(iso: string): string {
  const minutos = Math.max(
    0,
    Math.round((Date.now() - new Date(iso).getTime()) / 60000),
  );
  if (minutos < 1) return "agora mesmo";
  if (minutos === 1) return "há 1 minuto";
  if (minutos < 60) return `há ${minutos} minutos`;
  const horas = Math.round(minutos / 60);
  return horas === 1 ? "há 1 hora" : `há ${horas} horas`;
}

function BlocoEscala({ escala }: { escala: EscalaPlantao }) {
  const deAgora = escala.turnos.find((t) => t.agora) ?? null;
  const proximos = escala.turnos.filter((t) => !t.agora).slice(0, 6);

  return (
    <Card className="border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">
          {escala.rotulo}
        </h2>
        {deAgora ? (
          <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">
            de plantão agora
          </span>
        ) : null}
      </div>

      <CardContent className="space-y-4 p-4">
        {escala.erro ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <span>{escala.erro}</span>
          </div>
        ) : null}

        {!escala.erro && deAgora ? (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
            <p className="text-base font-semibold text-foreground">
              {deAgora.titulo}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {rotuloPeriodo(deAgora)}
            </p>
          </div>
        ) : null}

        {!escala.erro && !deAgora ? (
          <p className="text-sm text-muted-foreground">
            Ninguém de plantão neste momento.
          </p>
        ) : null}

        {proximos.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Próximos
            </p>
            <ul className="space-y-1.5">
              {proximos.map((turno, i) => (
                <li
                  key={`${turno.inicio}-${i}`}
                  className="flex flex-col gap-0.5 border-b border-border/60 pb-1.5 last:border-0 last:pb-0"
                >
                  <span className="text-sm text-foreground">{turno.titulo}</span>
                  <span className="text-xs text-muted-foreground">
                    {rotuloPeriodo(turno)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!escala.erro && escala.turnos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum plantão marcado no período.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Conteúdo do Plantão (calendários do Outlook), sem a moldura da página.
 * É a primeira aba de Agendas; a rota /plantao usa o mesmo conteúdo.
 */
export function PlantaoOutlook() {
  const [dados, setDados] = useState<PlantaoResposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setDados(await plantaoService.escalas());
    } catch (e) {
      setErro(
        e instanceof Error ? e.message : "Não foi possível ler as escalas.",
      );
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
        <div className="font-sans w-full space-y-6">
          <p className="text-sm text-muted-foreground">
            Quem está de plantão em cada equipe, direto do calendário do
            Outlook. Só leitura — a escala continua sendo montada lá.
          </p>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {dados
                ? `Atualizado ${desdeQuando(dados.atualizadoEm)}`
                : "Carregando…"}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void carregar()}
              disabled={carregando}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${carregando ? "animate-spin" : ""}`}
              />
              Atualizar
            </Button>
          </div>

          {erro ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span>{erro}</span>
            </div>
          ) : null}

          {dados && !dados.configurado ? (
            <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>
                Nenhum calendário de plantão configurado neste ambiente. Defina
                <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">
                  PLANTAO_CALENDARIOS
                </code>
                no servidor.
              </span>
            </div>
          ) : null}

          {dados && dados.configurado ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {dados.escalas.map((escala) => (
                <BlocoEscala key={escala.rotulo} escala={escala} />
              ))}
            </div>
          ) : null}

          {!dados && carregando ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Card key={i} className="border border-border bg-card">
                  <CardContent className="flex h-48 items-center justify-center">
                    <CalendarClock className="h-6 w-6 animate-pulse text-muted-foreground" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : null}
        </div>
  );
}

export function PortalPageComponent() {
  return (
    <ProtectedPage>
      <AppShell>
        <div className="font-sans w-full space-y-6">
          <h1 className="text-3xl font-bold text-foreground">Plantão</h1>
          <PlantaoOutlook />
        </div>
      </AppShell>
    </ProtectedPage>
  );
}
