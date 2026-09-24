"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldLabel } from "@/components/ui/field-label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isAdmin } from "@/lib/access-control";
import { useConfirm } from "@/lib/confirm";
import {
  campoBrasiliaParaIso,
  diaBrasilia,
  horaBrasilia,
  isoParaCampoBrasilia,
} from "@/lib/fuso-brasilia";
import { notifyError, notifySuccess } from "@/lib/notify";
import { companiesService } from "@/lib/services/companies.service";
import {
  manutencaoService,
  type CalendarioManutencao,
  type GmudNoCalendario,
  type JanelaManutencao,
  type JanelaManutencaoInput,
  type SituacaoGmud,
} from "@/lib/services/manutencao.service";
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

const STATUS_GMUD: Record<string, string> = {
  DRAFT: "Rascunho",
  PENDING_APPROVAL: "Pendente aprovação",
  APPROVED: "Aprovada",
  IN_EXECUTION: "Em execução",
  EXECUTED: "Executada",
};

const RESPONSAVEL: Record<"ALLE" | "CLIENTE", string> = {
  ALLE: "Alle",
  CLIENTE: "Cliente",
};

const ALTERACAO: Record<"ALLE" | "CLIENTE", string> = {
  ALLE: "alteração da Alle",
  CLIENTE: "alteração do cliente",
};

const SELECT =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm";

/** "YYYY-MM-DD" ± n dias, sem fuso horário. */
function somarDias(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function diaDaSemana(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Segunda-feira da semana do dia. */
function segundaDe(ymd: string): string {
  const semana = diaDaSemana(ymd);
  return somarDias(ymd, semana === 0 ? -6 : 1 - semana);
}

/** "quarta-feira" → "Quarta-feira" (o capitalize do CSS faria "Quarta-Feira"). */
const maiuscula = (texto: string) =>
  texto.charAt(0).toUpperCase() + texto.slice(1);

const dataCurta = (ymd: string) =>
  ymd.split("-").reverse().slice(0, 2).join("/");
const dataLonga = (ymd: string) => ymd.split("-").reverse().join("/");

/** "22:00–06:00", com o dia quando o fim cai em outro dia. */
function faixa(inicio: string, fim: string): string {
  const mesmoDia = diaBrasilia(inicio) === diaBrasilia(fim);
  return `${horaBrasilia(inicio)}–${horaBrasilia(fim)}${
    mesmoDia ? "" : ` (${dataCurta(diaBrasilia(fim))})`
  }`;
}

function resumoJanela(j: JanelaManutencao): string {
  if (!j.recorrente) {
    return j.inicio && j.fim
      ? `Uma vez: ${dataLonga(diaBrasilia(j.inicio))} ${faixa(j.inicio, j.fim)}`
      : "Uma vez";
  }
  const dias = j.daysOfWeek.map((d) => DIAS[d]).join(", ");
  const validade = [
    j.validFrom ? `desde ${dataLonga(j.validFrom)}` : "",
    j.validTo ? `até ${dataLonga(j.validTo)}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `${dias} · ${j.startTime}–${j.endTime}${validade ? ` · ${validade}` : ""}`;
}

type Formulario = {
  id: string | null;
  companyId: string;
  recorrente: boolean;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  validFrom: string;
  validTo: string;
  /** datetime-local, em Brasília. */
  inicio: string;
  fim: string;
  responsavel: "ALLE" | "CLIENTE";
  observacoes: string;
};

const FORM_VAZIO: Formulario = {
  id: null,
  companyId: "",
  recorrente: true,
  daysOfWeek: [2, 4],
  startTime: "22:00",
  endTime: "06:00",
  validFrom: "",
  validTo: "",
  inicio: "",
  fim: "",
  responsavel: "ALLE",
  observacoes: "",
};

function Situacao({ gmud }: { gmud: GmudNoCalendario }) {
  const estilos: Record<SituacaoGmud, string> = {
    FORA: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
    DENTRO:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    SEM_JANELA: "border-border bg-muted/40 text-muted-foreground",
  };
  const Icone =
    gmud.situacao === "FORA"
      ? AlertTriangle
      : gmud.situacao === "DENTRO"
        ? CheckCircle2
        : CircleDashed;
  const texto =
    gmud.situacao === "FORA"
      ? `Fora da janela: ${gmud.fora.map((f) => faixa(f.inicio, f.fim)).join(", ")}`
      : gmud.situacao === "DENTRO"
        ? "Dentro da janela"
        : "Empresa sem janela cadastrada";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        estilos[gmud.situacao],
      )}
    >
      <Icone aria-hidden className="size-3.5 shrink-0" />
      {texto}
    </span>
  );
}

export function ManutencaoAba() {
  const confirm = useConfirm();
  const admin = isAdmin();
  const hoje = todayYmdLocal();

  const [segunda, setSegunda] = useState(() => segundaDe(hoje));
  const [empresaId, setEmpresaId] = useState("");
  const [calendario, setCalendario] = useState<CalendarioManutencao | null>(
    null,
  );
  const [janelas, setJanelas] = useState<JanelaManutencao[]>([]);
  const [empresas, setEmpresas] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState<Formulario | null>(null);
  const [salvando, setSalvando] = useState(false);

  const domingo = somarDias(segunda, 6);
  const estaSemana = segunda === segundaDe(hoje);

  const carregarCalendario = useCallback(async () => {
    try {
      setCarregando(true);
      setCalendario(
        await manutencaoService.calendario(
          segunda,
          somarDias(segunda, 6),
          empresaId || undefined,
        ),
      );
    } catch (err) {
      setCalendario(null);
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível ler o calendário de manutenção.",
      );
    } finally {
      setCarregando(false);
    }
  }, [segunda, empresaId]);

  const carregarJanelas = useCallback(async () => {
    try {
      setJanelas(await manutencaoService.janelas());
    } catch (err) {
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível ler as janelas dos clientes.",
      );
    }
  }, []);

  useEffect(() => {
    void carregarCalendario();
  }, [carregarCalendario]);

  useEffect(() => {
    void carregarJanelas();
  }, [carregarJanelas]);

  // Admin cadastra janela para qualquer empresa; os demais filtram pelas que
  // já aparecem (janelas e GMUDs que podem ver).
  useEffect(() => {
    if (!admin) return;
    companiesService
      .list()
      .then((lista) =>
        setEmpresas(
          lista
            .filter((c) => c.status !== false)
            .map((c) => ({ id: c.id, name: c.name }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        ),
      )
      .catch(() => setEmpresas([]));
  }, [admin]);

  const opcoesFiltro = useMemo(() => {
    if (admin && empresas.length > 0) return empresas;
    const mapa = new Map<string, string>();
    for (const j of janelas) mapa.set(j.companyId, j.companyName);
    for (const g of calendario?.gmuds ?? [])
      mapa.set(g.companyId, g.companyName);
    return [...mapa]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [admin, empresas, janelas, calendario]);

  const dias = useMemo(
    () => Array.from({ length: 7 }, (_, i) => somarDias(segunda, i)),
    [segunda],
  );

  /** GMUD entra no dia do primeiro trecho; janela, em cada dia que começa. */
  const porDia = useMemo(() => {
    const mapa = new Map<
      string,
      {
        gmuds: GmudNoCalendario[];
        janelas: CalendarioManutencao["janelas"];
      }
    >();
    for (const d of dias) mapa.set(d, { gmuds: [], janelas: [] });
    for (const g of calendario?.gmuds ?? []) {
      const primeiro = g.trechos[0];
      if (!primeiro) continue;
      mapa.get(diaBrasilia(primeiro.inicio))?.gmuds.push(g);
    }
    for (const j of calendario?.janelas ?? []) {
      mapa.get(diaBrasilia(j.inicio))?.janelas.push(j);
    }
    return mapa;
  }, [calendario, dias]);

  const totais = useMemo(() => {
    const gmuds = calendario?.gmuds ?? [];
    return {
      total: gmuds.length,
      fora: gmuds.filter((g) => g.situacao === "FORA").length,
      semJanela: gmuds.filter((g) => g.situacao === "SEM_JANELA").length,
    };
  }, [calendario]);

  const janelasVisiveis = empresaId
    ? janelas.filter((j) => j.companyId === empresaId)
    : janelas;

  // --- janelas -------------------------------------------------------------

  function abrirNova() {
    setForm({ ...FORM_VAZIO, companyId: empresaId, validFrom: hoje });
  }

  function abrirEdicao(j: JanelaManutencao) {
    setForm({
      id: j.id,
      companyId: j.companyId,
      recorrente: j.recorrente,
      daysOfWeek: j.daysOfWeek,
      startTime: j.startTime ?? FORM_VAZIO.startTime,
      endTime: j.endTime ?? FORM_VAZIO.endTime,
      validFrom: j.validFrom ?? "",
      validTo: j.validTo ?? "",
      inicio: j.inicio ? isoParaCampoBrasilia(j.inicio) : "",
      fim: j.fim ? isoParaCampoBrasilia(j.fim) : "",
      responsavel: j.responsavel,
      observacoes: j.observacoes ?? "",
    });
  }

  async function salvar() {
    if (!form) return;
    if (!form.companyId) {
      notifyError("Escolha a empresa.");
      return;
    }
    let dados: JanelaManutencaoInput;
    if (form.recorrente) {
      if (form.daysOfWeek.length === 0) {
        notifyError("Marque pelo menos um dia da semana.");
        return;
      }
      dados = {
        companyId: form.companyId,
        recorrente: true,
        daysOfWeek: form.daysOfWeek,
        startTime: form.startTime,
        endTime: form.endTime,
        validFrom: form.validFrom || null,
        validTo: form.validTo || null,
        inicio: null,
        fim: null,
        responsavel: form.responsavel,
        observacoes: form.observacoes.trim() || null,
      };
    } else {
      const inicio = campoBrasiliaParaIso(form.inicio);
      const fim = campoBrasiliaParaIso(form.fim);
      if (!inicio || !fim) {
        notifyError("Informe início e fim da janela.");
        return;
      }
      dados = {
        companyId: form.companyId,
        recorrente: false,
        daysOfWeek: [],
        startTime: null,
        endTime: null,
        validFrom: null,
        validTo: null,
        inicio,
        fim,
        responsavel: form.responsavel,
        observacoes: form.observacoes.trim() || null,
      };
    }
    try {
      setSalvando(true);
      if (form.id) await manutencaoService.atualizarJanela(form.id, dados);
      else await manutencaoService.criarJanela(dados);
      notifySuccess("Janela salva.");
      setForm(null);
      await Promise.all([carregarJanelas(), carregarCalendario()]);
    } catch (err) {
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível salvar a janela.",
      );
    } finally {
      setSalvando(false);
    }
  }

  async function remover(j: JanelaManutencao) {
    const ok = await confirm({
      title: "Tirar esta janela?",
      description: `${j.companyName}: ${resumoJanela(j)}. O histórico fica guardado.`,
      confirmText: "Tirar",
      variant: "warning",
    });
    if (!ok) return;
    try {
      await manutencaoService.removerJanela(j.id);
      notifySuccess("Janela retirada.");
      await Promise.all([carregarJanelas(), carregarCalendario()]);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível tirar a janela.",
      );
    }
  }

  // --- tela ------------------------------------------------------------------

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Janelas combinadas com cada cliente e as GMUDs da semana por cima. GMUD
        fora de toda janela da empresa aparece em vermelho: é um aviso, não
        impede a mudança.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Semana anterior"
            onClick={() => setSegunda((s) => somarDias(s, -7))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-36 text-center text-sm font-medium text-foreground">
            {dataCurta(segunda)} a {dataLonga(domingo)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Próxima semana"
            onClick={() => setSegunda((s) => somarDias(s, 7))}
          >
            <ChevronRight className="size-4" />
          </Button>
          {!estaSemana ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSegunda(segundaDe(hoje))}
            >
              Esta semana
            </Button>
          ) : null}
        </div>
        <label className="flex w-full items-center gap-2 text-sm sm:w-72">
          <span className="shrink-0 text-muted-foreground">Empresa</span>
          <select
            className={SELECT}
            value={empresaId}
            onChange={(e) => setEmpresaId(e.target.value)}
          >
            <option value="">Todas</option>
            {opcoesFiltro.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Resumo: o que o NOC quer saber antes de rolar a semana. */}
      {calendario && !carregando ? (
        <div
          className={cn(
            "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm",
            totais.fora > 0
              ? "border-red-500/40 bg-red-500/5"
              : "border-primary/30 bg-primary/5",
          )}
        >
          {totais.fora > 0 ? (
            <AlertTriangle
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-red-500"
            />
          ) : (
            <CalendarClock
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-primary"
            />
          )}
          <p className="text-foreground">
            {totais.total === 0
              ? "Nenhuma GMUD agendada nesta semana."
              : `${totais.total} GMUD${totais.total > 1 ? "s" : ""} na semana`}
            {totais.fora > 0 ? (
              <strong className="text-red-700 dark:text-red-300">
                {" "}
                · {totais.fora} fora da janela
              </strong>
            ) : null}
            {totais.semJanela > 0 ? (
              <span className="text-muted-foreground">
                {" "}
                · {totais.semJanela} de empresa sem janela
              </span>
            ) : null}
          </p>
        </div>
      ) : null}

      {carregando ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-border">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ol className="space-y-3">
          {dias.map((dia) => {
            const itens = porDia.get(dia);
            const vazio =
              !itens ||
              (itens.gmuds.length === 0 && itens.janelas.length === 0);
            return (
              <li
                key={dia}
                className={cn(
                  "rounded-xl border bg-card p-4",
                  dia === hoje ? "border-primary/50" : "border-border",
                )}
              >
                <h3 className="text-sm font-semibold text-foreground">
                  {maiuscula(DIAS_LONGOS[diaDaSemana(dia)])}, {dataCurta(dia)}
                  {dia === hoje ? (
                    <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                      hoje
                    </span>
                  ) : null}
                </h3>

                {vazio ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Nada agendado.
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {itens.janelas.length > 0 ? (
                      <ul
                        className="flex flex-wrap gap-2"
                        aria-label="Janelas do dia"
                      >
                        {itens.janelas.map((j) => (
                          <li
                            key={`${j.janelaId}-${j.inicio}`}
                            title={j.observacoes ?? undefined}
                            className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1 text-xs text-foreground"
                          >
                            <span className="font-medium">{j.companyName}</span>{" "}
                            <span className="text-muted-foreground">
                              · janela {faixa(j.inicio, j.fim)} ·{" "}
                              {RESPONSAVEL[j.responsavel]}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {itens.gmuds.map((g) => (
                      <article
                        key={g.id}
                        className={cn(
                          "rounded-lg border p-3",
                          g.situacao === "FORA"
                            ? "border-red-500/40 bg-red-500/5"
                            : "border-border bg-muted/10",
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Link
                              href={`/gmud/${g.id}`}
                              className="font-medium text-foreground underline-offset-2 hover:underline"
                            >
                              GMUD #{g.code} — {g.title}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {g.companyName} ·{" "}
                              {STATUS_GMUD[g.status] ?? g.status}
                            </p>
                          </div>
                          <Situacao gmud={g} />
                        </div>
                        <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                          {g.trechos.map((t, i) => (
                            <li key={i}>
                              {t.tipo === "INDISPONIBILIDADE"
                                ? "Indisponibilidade"
                                : "Atividade"}
                              : {dataCurta(diaBrasilia(t.inicio))}{" "}
                              {faixa(t.inicio, t.fim)}
                            </li>
                          ))}
                        </ul>
                      </article>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {/* Janelas cadastradas: todos veem (as dicas servem a quem vai mexer). */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            Janelas dos clientes
          </h2>
          {admin ? (
            <Button type="button" size="sm" onClick={abrirNova}>
              <Plus className="mr-1 size-4" />
              Nova janela
            </Button>
          ) : null}
        </div>

        {janelasVisiveis.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma janela cadastrada
            {empresaId ? " para esta empresa" : ""}. Cada janela diz quando se
            pode mexer no ambiente do cliente e de quem é a alteração.
          </p>
        ) : (
          <ul className="divide-y divide-border/70">
            {janelasVisiveis.map((j) => (
              <li
                key={j.id}
                className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    {j.companyName}{" "}
                    <span className="font-normal text-muted-foreground">
                      · {ALTERACAO[j.responsavel]}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {resumoJanela(j)}
                  </p>
                  {j.observacoes ? (
                    <p className="mt-1 whitespace-pre-line text-xs text-foreground/80">
                      {j.observacoes}
                    </p>
                  ) : null}
                </div>
                {admin ? (
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Editar janela de ${j.companyName}`}
                      onClick={() => abrirEdicao(j)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Tirar janela de ${j.companyName}`}
                      onClick={() => void remover(j)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- janela --- */}
      <Dialog
        open={Boolean(form)}
        onOpenChange={(open) => !open && setForm(null)}
      >
        <DialogContent className="font-sans flex max-h-[min(84vh,720px)] sm:max-w-2xl flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4">
            <DialogTitle>
              {form?.id ? "Editar janela" : "Nova janela de manutenção"}
            </DialogTitle>
          </DialogHeader>

          {form ? (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <div className="space-y-2">
                <FieldLabel className="font-sans text-sm font-semibold">
                  Empresa
                </FieldLabel>
                <select
                  className={SELECT}
                  value={form.companyId}
                  onChange={(e) =>
                    setForm((f) => f && { ...f, companyId: e.target.value })
                  }
                >
                  <option value="">Escolha…</option>
                  {empresas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <FieldLabel className="font-sans text-sm font-semibold">
                  Quando
                </FieldLabel>
                <div className="grid grid-cols-2 gap-2">
                  {([true, false] as const).map((recorrente) => (
                    <button
                      key={String(recorrente)}
                      type="button"
                      aria-pressed={form.recorrente === recorrente}
                      onClick={() => setForm((f) => f && { ...f, recorrente })}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-sm transition",
                        form.recorrente === recorrente
                          ? "border-primary bg-primary/10 font-semibold text-foreground"
                          : "border-border hover:bg-muted",
                      )}
                    >
                      {recorrente ? "Toda semana" : "Uma vez só"}
                    </button>
                  ))}
                </div>
              </div>

              {form.recorrente ? (
                <>
                  <div className="space-y-2">
                    <FieldLabel className="font-sans text-sm font-semibold">
                      Dias da semana
                    </FieldLabel>
                    <div className="flex flex-wrap gap-2">
                      {DIAS.map((rotulo, indice) => {
                        const marcado = form.daysOfWeek.includes(indice);
                        return (
                          <button
                            key={rotulo}
                            type="button"
                            aria-pressed={marcado}
                            onClick={() =>
                              setForm((f) => {
                                if (!f) return f;
                                const dias = marcado
                                  ? f.daysOfWeek.filter((d) => d !== indice)
                                  : [...f.daysOfWeek, indice].sort();
                                return { ...f, daysOfWeek: dias };
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
                      <FieldLabel className="font-sans text-sm font-semibold">
                        Início
                      </FieldLabel>
                      <Input
                        type="time"
                        value={form.startTime}
                        onChange={(e) =>
                          setForm(
                            (f) => f && { ...f, startTime: e.target.value },
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <FieldLabel className="font-sans text-sm font-semibold">
                        Fim
                      </FieldLabel>
                      <Input
                        type="time"
                        value={form.endTime}
                        onChange={(e) =>
                          setForm((f) => f && { ...f, endTime: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  {form.endTime <= form.startTime ? (
                    <p className="-mt-2 text-xs text-muted-foreground">
                      O fim é antes do início: a janela vira a noite e termina
                      no dia seguinte.
                    </p>
                  ) : null}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <FieldLabel className="font-sans text-sm font-semibold">
                        Vale a partir de (opcional)
                      </FieldLabel>
                      <Input
                        type="date"
                        value={form.validFrom}
                        onChange={(e) =>
                          setForm(
                            (f) => f && { ...f, validFrom: e.target.value },
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
                        value={form.validTo}
                        onChange={(e) =>
                          setForm((f) => f && { ...f, validTo: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <FieldLabel className="font-sans text-sm font-semibold">
                      Início (horário de Brasília)
                    </FieldLabel>
                    <Input
                      type="datetime-local"
                      value={form.inicio}
                      onChange={(e) =>
                        setForm((f) => f && { ...f, inicio: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel className="font-sans text-sm font-semibold">
                      Fim (horário de Brasília)
                    </FieldLabel>
                    <Input
                      type="datetime-local"
                      value={form.fim}
                      onChange={(e) =>
                        setForm((f) => f && { ...f, fim: e.target.value })
                      }
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <FieldLabel className="font-sans text-sm font-semibold">
                  De quem é a alteração
                </FieldLabel>
                <div className="grid grid-cols-2 gap-2">
                  {(["ALLE", "CLIENTE"] as const).map((quem) => (
                    <button
                      key={quem}
                      type="button"
                      aria-pressed={form.responsavel === quem}
                      onClick={() =>
                        setForm((f) => f && { ...f, responsavel: quem })
                      }
                      className={cn(
                        "rounded-lg border px-3 py-2 text-sm transition",
                        form.responsavel === quem
                          ? "border-primary bg-primary/10 font-semibold text-foreground"
                          : "border-border hover:bg-muted",
                      )}
                    >
                      {RESPONSAVEL[quem]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <FieldLabel className="font-sans text-sm font-semibold">
                  Observações (opcional)
                </FieldLabel>
                <Textarea
                  rows={3}
                  maxLength={2000}
                  placeholder="Ex.: não reiniciar o ERP antes das 23h; avisar o TI do cliente pelo WhatsApp."
                  value={form.observacoes}
                  onChange={(e) =>
                    setForm((f) => f && { ...f, observacoes: e.target.value })
                  }
                />
              </div>
            </div>
          ) : null}

          <DialogFooter
            bleed={false}
            className="shrink-0 border-t border-border/60 px-6"
          >
            <Button
              type="button"
              variant="outline"
              onClick={() => setForm(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={salvando}
              onClick={() => void salvar()}
            >
              {salvando ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
