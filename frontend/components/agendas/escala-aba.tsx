"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";

import {
  EscalaLinhaDoTempo,
  rotuloMinuto,
} from "@/components/agendas/escala-linha-do-tempo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldLabel } from "@/components/ui/field-label";
import { FlipCheckbox } from "@/components/ui/flip-checkbox";
import { Input } from "@/components/ui/input";
import { isAdmin } from "@/lib/access-control";
import { useConfirm } from "@/lib/confirm";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  escalaService,
  type OpcoesEscala,
  type RegraEscala,
  type RegraEscalaInput,
  type TurnoEscala,
} from "@/lib/services/escala.service";
import { todayYmdLocal } from "@/lib/today-local";
import { cn } from "@/lib/utils";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DIAS_LONGOS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

/** "YYYY-MM-DD" ± n dias, sem fuso horário. */
function somarDias(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function rotuloDia(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const semana = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DIAS_LONGOS[semana]}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

const REGRA_VAZIA: RegraEscalaInput = {
  userId: "",
  specialtyId: "",
  startTime: "08:00",
  endTime: "17:00",
  daysOfWeek: [1, 2, 3, 4, 5],
  validFrom: "",
  validTo: null,
};

type ExcecaoForm = {
  turno: TurnoEscala;
  tipo: "FOLGA" | "TROCA";
  substituteUserId: string;
  recortar: boolean;
  startTime: string;
  endTime: string;
  motivo: string;
};

function paraHHMM(minuto: number): string {
  const noDia = ((minuto % 1440) + 1440) % 1440;
  return `${String(Math.floor(noDia / 60)).padStart(2, "0")}:${String(noDia % 60).padStart(2, "0")}`;
}

const SELECT =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm";

export function EscalaAba() {
  const confirm = useConfirm();
  const admin = isAdmin();

  const [dia, setDia] = useState(() => todayYmdLocal());
  const [turnos, setTurnos] = useState<TurnoEscala[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [agoraMin, setAgoraMin] = useState<number | null>(null);

  const [opcoes, setOpcoes] = useState<OpcoesEscala | null>(null);
  const [regras, setRegras] = useState<RegraEscala[]>([]);

  const [regraAberta, setRegraAberta] = useState<{
    id: string | null;
    dados: RegraEscalaInput;
  } | null>(null);
  const [excecao, setExcecao] = useState<ExcecaoForm | null>(null);
  const [salvando, setSalvando] = useState(false);

  const hoje = todayYmdLocal();
  const ehHoje = dia === hoje;

  // Relógio da linha de "agora": só anda quando o dia mostrado é hoje.
  useEffect(() => {
    if (!ehHoje) return;
    const tick = () => {
      const d = new Date();
      setAgoraMin(d.getHours() * 60 + d.getMinutes());
    };
    const inicial = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 60_000);
    return () => {
      window.clearTimeout(inicial);
      window.clearInterval(timer);
    };
  }, [ehHoje]);

  const carregarDia = useCallback(async (data: string) => {
    try {
      setCarregando(true);
      const res = await escalaService.dia(data);
      setTurnos(res.turnos);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível ler a escala.",
      );
      setTurnos([]);
    } finally {
      setCarregando(false);
    }
  }, []);

  const carregarAdmin = useCallback(async () => {
    if (!admin) return;
    try {
      const [ops, lista] = await Promise.all([
        escalaService.opcoes(),
        escalaService.regras(),
      ]);
      setOpcoes(ops);
      setRegras(lista);
    } catch (err) {
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar as regras da escala.",
      );
    }
  }, [admin]);

  useEffect(() => {
    void carregarDia(dia);
  }, [dia, carregarDia]);

  useEffect(() => {
    void carregarAdmin();
  }, [carregarAdmin]);

  const deAgora = useMemo(() => {
    if (!ehHoje || agoraMin === null) return [];
    return turnos.filter(
      (t) => t.origem !== "FOLGA" && t.inicio <= agoraMin && agoraMin < t.fim,
    );
  }, [turnos, ehHoje, agoraMin]);

  async function recarregarTudo() {
    await Promise.all([carregarDia(dia), carregarAdmin()]);
  }

  // --- regras ----------------------------------------------------------------

  async function salvarRegra() {
    if (!regraAberta) return;
    const d = regraAberta.dados;
    if (!d.userId || !d.specialtyId) {
      notifyError("Escolha a pessoa e a especialidade.");
      return;
    }
    if (d.daysOfWeek.length === 0) {
      notifyError("Marque pelo menos um dia da semana.");
      return;
    }
    if (!d.validFrom) {
      notifyError("Informe a partir de quando a regra vale.");
      return;
    }
    try {
      setSalvando(true);
      const payload = { ...d, validTo: d.validTo || null };
      if (regraAberta.id) {
        await escalaService.atualizarRegra(regraAberta.id, payload);
      } else {
        await escalaService.criarRegra(payload);
      }
      notifySuccess("Escala salva.");
      setRegraAberta(null);
      await recarregarTudo();
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível salvar a regra.",
      );
    } finally {
      setSalvando(false);
    }
  }

  async function removerRegra(regra: RegraEscala) {
    const ok = await confirm({
      title: "Tirar esta regra da escala?",
      description: `${regra.userName} deixa de aparecer das ${regra.startTime} às ${regra.endTime}. O histórico fica guardado.`,
      confirmText: "Tirar",
      variant: "warning",
    });
    if (!ok) return;
    try {
      await escalaService.removerRegra(regra.id);
      notifySuccess("Regra retirada.");
      await recarregarTudo();
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível tirar a regra.",
      );
    }
  }

  // --- exceções ------------------------------------------------------------

  function abrirExcecao(turno: TurnoEscala) {
    setExcecao({
      turno,
      tipo: turno.origem === "FOLGA" ? "FOLGA" : "TROCA",
      substituteUserId: "",
      recortar: false,
      startTime: paraHHMM(turno.inicio),
      endTime: paraHHMM(turno.fim),
      motivo: turno.motivo ?? "",
    });
  }

  async function salvarExcecao() {
    if (!excecao) return;
    if (excecao.tipo === "TROCA" && !excecao.substituteUserId) {
      notifyError("Escolha quem assume o turno.");
      return;
    }
    try {
      setSalvando(true);
      await escalaService.registrarExcecao({
        regraId: excecao.turno.regraId,
        date: excecao.turno.diaDoTurno,
        tipo: excecao.tipo,
        substituteUserId:
          excecao.tipo === "TROCA" ? excecao.substituteUserId : null,
        startTime: excecao.recortar ? excecao.startTime : null,
        endTime: excecao.recortar ? excecao.endTime : null,
        motivo: excecao.motivo.trim() || null,
      });
      notifySuccess(
        excecao.tipo === "TROCA" ? "Troca registrada." : "Folga registrada.",
      );
      setExcecao(null);
      await carregarDia(dia);
    } catch (err) {
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível registrar a exceção.",
      );
    } finally {
      setSalvando(false);
    }
  }

  async function desfazerExcecao() {
    if (!excecao) return;
    try {
      setSalvando(true);
      await escalaService.removerExcecao(
        excecao.turno.regraId,
        excecao.turno.diaDoTurno,
      );
      notifySuccess("O turno voltou para quem é pela escala.");
      setExcecao(null);
      await carregarDia(dia);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível desfazer.",
      );
    } finally {
      setSalvando(false);
    }
  }

  const temExcecao = Boolean(excecao?.turno.excecaoId);

  // --- tela ------------------------------------------------------------------

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Quem responde em cada hora do dia, por especialidade.
        {admin ? " Clique numa pessoa para registrar folga ou troca." : ""}
      </p>

      {/* Navegação por dia. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Dia anterior"
            onClick={() => setDia((d) => somarDias(d, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Input
            type="date"
            value={dia}
            onChange={(e) => e.target.value && setDia(e.target.value)}
            className="h-9 w-40"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Próximo dia"
            onClick={() => setDia((d) => somarDias(d, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
          {!ehHoje ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setDia(hoje)}>
              Hoje
            </Button>
          ) : null}
        </div>
        <p className="text-sm font-medium capitalize text-foreground">
          {rotuloDia(dia)}
        </p>
      </div>

      {/* A resposta que o NOC quer em um segundo. */}
      {ehHoje ? (
        <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
          <Users className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="text-sm">
            <span className="font-semibold text-foreground">Agora: </span>
            {deAgora.length === 0 ? (
              <span className="text-muted-foreground">ninguém escalado neste horário.</span>
            ) : (
              deAgora.map((t, i) => (
                <span key={`${t.regraId}-${i}`} className="text-foreground">
                  {i > 0 ? " · " : ""}
                  <strong>{t.userName}</strong>{" "}
                  <span className="text-muted-foreground">
                    ({t.specialtyName}, até {rotuloMinuto(t.fim)})
                  </span>
                </span>
              ))
            )}
          </div>
        </div>
      ) : null}

      {carregando ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-border">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <EscalaLinhaDoTempo
          turnos={turnos}
          agora={ehHoje ? agoraMin : null}
          onClicarTurno={admin ? abrirExcecao : undefined}
        />
      )}

      {/* Cadastro de regras: só admin. */}
      {admin ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              Regras da escala
            </h2>
            <Button
              type="button"
              size="sm"
              onClick={() =>
                setRegraAberta({
                  id: null,
                  dados: { ...REGRA_VAZIA, validFrom: hoje },
                })
              }
            >
              <Plus className="mr-1 size-4" />
              Nova regra
            </Button>
          </div>

          {regras.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma regra cadastrada. Cada regra diz quem atende, em que
              horário e em quais dias da semana.
            </p>
          ) : (
            <ul className="divide-y divide-border/70">
              {regras.map((regra) => (
                <li
                  key={regra.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {regra.userName}{" "}
                      <span className="font-normal text-muted-foreground">
                        · {regra.specialtyName}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {regra.startTime}–{regra.endTime} ·{" "}
                      {regra.daysOfWeek.map((d) => DIAS[d]).join(", ")} · desde{" "}
                      {regra.validFrom.split("-").reverse().join("/")}
                      {regra.validTo
                        ? ` até ${regra.validTo.split("-").reverse().join("/")}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Editar regra"
                      onClick={() =>
                        setRegraAberta({
                          id: regra.id,
                          dados: {
                            userId: regra.userId,
                            specialtyId: regra.specialtyId,
                            startTime: regra.startTime,
                            endTime: regra.endTime,
                            daysOfWeek: regra.daysOfWeek,
                            validFrom: regra.validFrom,
                            validTo: regra.validTo,
                          },
                        })
                      }
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Tirar regra"
                      onClick={() => void removerRegra(regra)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {/* --- regra --- */}
      <Dialog
        open={Boolean(regraAberta)}
        onOpenChange={(open) => !open && setRegraAberta(null)}
      >
        <DialogContent className="font-sans flex max-h-[min(84vh,680px)] max-w-2xl flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4">
            <DialogTitle>
              {regraAberta?.id ? "Editar regra" : "Nova regra de escala"}
            </DialogTitle>
          </DialogHeader>

          {regraAberta ? (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <FieldLabel className="font-sans text-sm font-semibold">Pessoa</FieldLabel>
                  <select
                    className={SELECT}
                    value={regraAberta.dados.userId}
                    onChange={(e) =>
                      setRegraAberta((r) =>
                        r && { ...r, dados: { ...r.dados, userId: e.target.value } },
                      )
                    }
                  >
                    <option value="">Escolha…</option>
                    {opcoes?.pessoas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <FieldLabel className="font-sans text-sm font-semibold">
                    Especialidade
                  </FieldLabel>
                  <select
                    className={SELECT}
                    value={regraAberta.dados.specialtyId}
                    onChange={(e) =>
                      setRegraAberta((r) =>
                        r && {
                          ...r,
                          dados: { ...r.dados, specialtyId: e.target.value },
                        },
                      )
                    }
                  >
                    <option value="">Escolha…</option>
                    {opcoes?.especialidades.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <FieldLabel className="font-sans text-sm font-semibold">Início</FieldLabel>
                  <Input
                    type="time"
                    value={regraAberta.dados.startTime}
                    onChange={(e) =>
                      setRegraAberta((r) =>
                        r && { ...r, dados: { ...r.dados, startTime: e.target.value } },
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel className="font-sans text-sm font-semibold">Fim</FieldLabel>
                  <Input
                    type="time"
                    value={regraAberta.dados.endTime}
                    onChange={(e) =>
                      setRegraAberta((r) =>
                        r && { ...r, dados: { ...r.dados, endTime: e.target.value } },
                      )
                    }
                  />
                </div>
              </div>
              {regraAberta.dados.endTime <= regraAberta.dados.startTime ? (
                <p className="-mt-2 text-xs text-muted-foreground">
                  O fim é antes do início: o turno vira a noite e termina no
                  dia seguinte. Ele conta como turno do dia em que começa.
                </p>
              ) : null}

              <div className="space-y-2">
                <FieldLabel className="font-sans text-sm font-semibold">
                  Dias da semana
                </FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {DIAS.map((rotulo, indice) => {
                    const marcado = regraAberta.dados.daysOfWeek.includes(indice);
                    return (
                      <button
                        key={rotulo}
                        type="button"
                        aria-pressed={marcado}
                        onClick={() =>
                          setRegraAberta((r) => {
                            if (!r) return r;
                            const dias = marcado
                              ? r.dados.daysOfWeek.filter((d) => d !== indice)
                              : [...r.dados.daysOfWeek, indice].sort();
                            return { ...r, dados: { ...r.dados, daysOfWeek: dias } };
                          })
                        }
                        className={cn(
                          "h-9 w-12 rounded-lg border text-sm transition",
                          marcado
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border hover:bg-muted",
                        )}
                      >
                        {rotulo}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <FieldLabel className="font-sans text-sm font-semibold">Vale a partir de</FieldLabel>
                  <Input
                    type="date"
                    value={regraAberta.dados.validFrom}
                    onChange={(e) =>
                      setRegraAberta((r) =>
                        r && { ...r, dados: { ...r.dados, validFrom: e.target.value } },
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel className="font-sans text-sm font-semibold">
                    Até (opcional)
                  </FieldLabel>
                  <Input
                    type="date"
                    value={regraAberta.dados.validTo ?? ""}
                    onChange={(e) =>
                      setRegraAberta((r) =>
                        r && {
                          ...r,
                          dados: { ...r.dados, validTo: e.target.value || null },
                        },
                      )
                    }
                  />
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter bleed={false} className="shrink-0 border-t border-border/60 px-6">
            <Button type="button" variant="outline" onClick={() => setRegraAberta(null)}>
              Cancelar
            </Button>
            <Button type="button" disabled={salvando} onClick={() => void salvarRegra()}>
              {salvando ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- folga / troca --- */}
      <Dialog open={Boolean(excecao)} onOpenChange={(open) => !open && setExcecao(null)}>
        <DialogContent className="font-sans flex max-h-[min(84vh,680px)] max-w-xl flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4">
            <DialogTitle>Folga ou troca</DialogTitle>
          </DialogHeader>

          {excecao ? (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <p className="text-sm text-muted-foreground">
                Turno de{" "}
                <strong className="text-foreground">
                  {excecao.turno.origem === "REGRA"
                    ? excecao.turno.userName
                    : excecao.turno.substituiu}
                </strong>{" "}
                ({excecao.turno.specialtyName}) em{" "}
                {excecao.turno.diaDoTurno.split("-").reverse().join("/")}. Vale só
                para este dia — a escala dos outros dias não muda.
              </p>

              <div className="grid grid-cols-2 gap-2">
                {(["TROCA", "FOLGA"] as const).map((tipo) => (
                  <button
                    key={tipo}
                    type="button"
                    aria-pressed={excecao.tipo === tipo}
                    onClick={() => setExcecao((e) => e && { ...e, tipo })}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm transition",
                      excecao.tipo === tipo
                        ? "border-primary bg-primary/10 font-semibold text-foreground"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    {tipo === "TROCA" ? "Outra pessoa assume" : "Folga (turno vago)"}
                  </button>
                ))}
              </div>

              {excecao.tipo === "TROCA" ? (
                <div className="space-y-2">
                  <FieldLabel className="font-sans text-sm font-semibold">Quem assume</FieldLabel>
                  <select
                    className={SELECT}
                    value={excecao.substituteUserId}
                    onChange={(e) =>
                      setExcecao((x) => x && { ...x, substituteUserId: e.target.value })
                    }
                  >
                    <option value="">Escolha…</option>
                    {opcoes?.pessoas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <label className="flex items-center gap-2 text-sm">
                <FlipCheckbox
                  checked={excecao.recortar}
                  onChange={(e) =>
                    setExcecao((x) => x && { ...x, recortar: e.target.checked })
                  }
                />
                <span>Só parte do turno</span>
              </label>

              {excecao.recortar ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <FieldLabel className="font-sans text-sm font-semibold">De</FieldLabel>
                    <Input
                      type="time"
                      value={excecao.startTime}
                      onChange={(e) =>
                        setExcecao((x) => x && { ...x, startTime: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel className="font-sans text-sm font-semibold">Até</FieldLabel>
                    <Input
                      type="time"
                      value={excecao.endTime}
                      onChange={(e) =>
                        setExcecao((x) => x && { ...x, endTime: e.target.value })
                      }
                    />
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <FieldLabel className="font-sans text-sm font-semibold">
                  Motivo (opcional)
                </FieldLabel>
                <Input
                  value={excecao.motivo}
                  maxLength={300}
                  placeholder="Ex.: folga compensatória, consulta médica…"
                  onChange={(e) => setExcecao((x) => x && { ...x, motivo: e.target.value })}
                />
              </div>
            </div>
          ) : null}

          <DialogFooter
            bleed={false}
            className="shrink-0 items-center gap-2 border-t border-border/60 px-6 sm:justify-between"
          >
            <div>
              {temExcecao ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={salvando}
                  onClick={() => void desfazerExcecao()}
                >
                  Desfazer exceção
                </Button>
              ) : null}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => setExcecao(null)}>
                Cancelar
              </Button>
              <Button type="button" disabled={salvando} onClick={() => void salvarExcecao()}>
                {salvando ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Registrar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
