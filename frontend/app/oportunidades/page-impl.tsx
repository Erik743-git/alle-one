"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Download,
  Loader2,
  Paperclip,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Trash2,
  Trophy,
  X,
} from "lucide-react";

import ProtectedPage from "@/components/auth/protected-page";
import AppShell from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { FieldLabel } from "@/components/ui/field-label";
import { FlipCheckbox } from "@/components/ui/flip-checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { canAccessOportunidades, isAdmin } from "@/lib/access-control";
import { buildApiUrl } from "@/lib/env";
import { authFetch } from "@/lib/auth-fetch";
import { useConfirm } from "@/lib/confirm";
import { readBlobDownload, triggerBrowserDownload } from "@/lib/download-blob";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  ESTAGIOS,
  MOTIVOS,
  TIPOS,
  oportunidadesService,
  type ConfigOportunidades,
  type EdicaoOportunidade,
  type Estagio,
  type FiltrosQuadro,
  type MotivoReprova,
  type Oportunidade,
  type Perfil,
  type Ranking,
  type TipoOportunidade,
} from "@/lib/services/oportunidades.service";
import { useExigirAcesso } from "@/lib/use-exigir-acesso";
import { cn } from "@/lib/utils";

const SELECT =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm";
const DIA_MS = 24 * 60 * 60 * 1000;

const rotuloEstagio = (e: Estagio) =>
  ESTAGIOS.find((x) => x.id === e)?.rotulo ?? e;
const rotuloTipo = (t: TipoOportunidade | null) =>
  TIPOS.find((x) => x.id === t)?.rotulo ?? "Sem tipo";
const reais = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const diasDesde = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DIA_MS));

/** Mesmo critério do alerta da API (15 dias pendente, 30 sem mexer). */
function estaParado(c: Oportunidade): boolean {
  if (!["PENDENTE", "EM_ANALISE", "PROPOSTA", "AGUARDO_CLIENTE"].includes(c.estagio)) {
    return false;
  }
  return (
    (c.estagio === "PENDENTE" && diasDesde(c.estagioDesde) >= 15) ||
    diasDesde(c.ultimaMovimentacao) >= 30
  );
}

/** O que falta perguntar antes de mover (tipo e/ou motivo). */
type MovimentoPendente = {
  card: Oportunidade;
  para: Estagio;
  tipo: TipoOportunidade | "";
  motivo: MotivoReprova | "";
  motivoTexto: string;
};

function OportunidadesPageImpl() {
  const confirm = useConfirm();
  const semAcesso = useExigirAcesso(canAccessOportunidades);
  const admin = isAdmin();

  const [filtros, setFiltros] = useState<FiltrosQuadro>({});
  const [busca, setBusca] = useState("");
  const [perfil, setPerfil] = useState<Perfil>({ admin: false, comercial: false });
  const [cards, setCards] = useState<Oportunidade[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [contador, setContador] = useState<{ ano: number; total: number } | null>(null);

  const [clientes, setClientes] = useState<Array<{ id: string; name: string }>>([]);
  const [responsaveis, setResponsaveis] = useState<Array<{ id: string; name: string }>>([]);
  const [pessoas, setPessoas] = useState<Array<{ id: string; name: string; email?: string }>>([]);

  const [novoAberto, setNovoAberto] = useState(false);
  const [aberto, setAberto] = useState<Oportunidade | null>(null);
  const [movimento, setMovimento] = useState<MovimentoPendente | null>(null);
  const [rankingAberto, setRankingAberto] = useState(false);
  const [configAberta, setConfigAberta] = useState(false);
  const [arrastando, setArrastando] = useState<string | null>(null);

  const gestao = perfil.admin || perfil.comercial;

  const carregar = useCallback(async () => {
    try {
      setCarregando(true);
      const r = await oportunidadesService.quadro(filtros);
      setPerfil(r.perfil);
      setCards(r.cards);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Não foi possível abrir o quadro.");
    } finally {
      setCarregando(false);
    }
  }, [filtros]);

  useEffect(() => {
    if (semAcesso) return;
    void carregar();
  }, [carregar, semAcesso]);

  // Busca com pequena espera: não chama a API a cada tecla.
  useEffect(() => {
    const t = window.setTimeout(
      () => setFiltros((f) => (f.busca === (busca || undefined) ? f : { ...f, busca: busca || undefined })),
      350,
    );
    return () => window.clearTimeout(t);
  }, [busca]);

  // Listas de apoio: só para quem administra.
  useEffect(() => {
    if (!gestao) return;
    Promise.all([
      oportunidadesService.clientes(),
      oportunidadesService.responsaveis(),
      oportunidadesService.pessoas(),
    ])
      .then(([c, r, p]) => {
        setClientes(c);
        setResponsaveis(r);
        setPessoas(p);
      })
      .catch(() => {
        /* os filtros ficam sem opções; o quadro funciona */
      });
  }, [gestao]);

  // Quem não administra vê o contador das que trouxe no ano.
  useEffect(() => {
    if (semAcesso || gestao || carregando) return;
    oportunidadesService.contador().then(setContador).catch(() => setContador(null));
  }, [semAcesso, gestao, carregando]);

  // Link do e-mail: /oportunidades?card=<id> abre o card direto.
  const abriuDoLink = useRef(false);
  useEffect(() => {
    if (abriuDoLink.current || carregando) return;
    const id = new URLSearchParams(window.location.search).get("card");
    if (!id) return;
    abriuDoLink.current = true;
    oportunidadesService.obter(id).then(setAberto).catch(() => notifyError("Oportunidade não encontrada."));
  }, [carregando]);

  const colunas = useMemo(
    () => ESTAGIOS.filter((e) => e.id !== "FECHADO" || filtros.incluirFechados),
    [filtros.incluirFechados],
  );

  function atualizarCard(novo: Oportunidade) {
    setCards((lista) => {
      const sem = lista.filter((c) => c.id !== novo.id);
      // Fechado some do quadro quando o filtro não está ligado.
      return novo.estagio === "FECHADO" && !filtros.incluirFechados ? sem : [...sem, novo];
    });
    setAberto((a) => (a?.id === novo.id ? novo : a));
  }

  // --- mover ------------------------------------------------------------------

  function pedirMovimento(card: Oportunidade, para: Estagio) {
    if (card.estagio === para) return;
    if (para === "PENDENTE") {
      notifyError("Depois de sair de Pendente, o card não volta para lá.");
      return;
    }
    const precisaTipo = card.estagio === "PENDENTE" && !card.tipo;
    if (precisaTipo || para === "REPROVADO") {
      setMovimento({ card, para, tipo: card.tipo ?? "", motivo: "", motivoTexto: "" });
      return;
    }
    void executarMovimento({ card, para, tipo: card.tipo ?? "", motivo: "", motivoTexto: "" });
  }

  async function executarMovimento(m: MovimentoPendente) {
    try {
      const novo = await oportunidadesService.mover(m.card.id, {
        para: m.para,
        ...(m.tipo ? { tipo: m.tipo } : {}),
        ...(m.motivo ? { motivoReprova: m.motivo } : {}),
        ...(m.motivoTexto.trim() ? { motivoReprovaTexto: m.motivoTexto.trim() } : {}),
      });
      atualizarCard(novo);
      setMovimento(null);
      notifySuccess(`#${novo.numero} em ${rotuloEstagio(novo.estagio)}.`);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Não foi possível mover o card.");
    }
  }

  // --- tela ---------------------------------------------------------------------

  return (
    <ProtectedPage>
      <AppShell>
        <div className="font-sans w-full space-y-4 pb-10">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Oportunidades</h1>
              <p className="text-sm text-muted-foreground">
                {gestao
                  ? "Arraste o card para mudar de coluna, ou abra o card e use “Mover para”."
                  : "Aqui aparecem as oportunidades que você trouxe. O comercial cuida do andamento."}
              </p>
              {contador ? (
                <p className="mt-1 text-sm text-foreground">
                  Você trouxe <strong>{contador.total}</strong>{" "}
                  {contador.total === 1 ? "oportunidade" : "oportunidades"} em {contador.ano}.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {gestao ? (
                <Button type="button" variant="outline" onClick={() => setRankingAberto(true)}>
                  <Trophy className="mr-1 size-4" />
                  Ranking
                </Button>
              ) : null}
              {admin ? (
                <Button
                  type="button"
                  variant="outline"
                  aria-label="Configuração das oportunidades"
                  onClick={() => setConfigAberta(true)}
                >
                  <Settings className="size-4" />
                </Button>
              ) : null}
              <Button type="button" onClick={() => setNovoAberto(true)}>
                <Plus className="mr-1 size-4" />
                Nova oportunidade
              </Button>
            </div>
          </div>

          <Filtros
            filtros={filtros}
            setFiltros={setFiltros}
            busca={busca}
            setBusca={setBusca}
            gestao={gestao}
            clientes={clientes}
            responsaveis={responsaveis}
          />

          {carregando && cards.length === 0 ? (
            <div className="flex h-60 items-center justify-center rounded-xl border border-border">
              <Loader2 className="size-7 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2" role="list" aria-label="Quadro de oportunidades">
              {colunas.map((coluna) => {
                const daColuna = cards
                  .filter((c) => c.estagio === coluna.id)
                  .sort((a, b) => a.estagioDesde.localeCompare(b.estagioDesde));
                return (
                  <section
                    key={coluna.id}
                    role="listitem"
                    aria-label={`${coluna.rotulo}: ${daColuna.length}`}
                    onDragOver={(e) => {
                      if (gestao && arrastando) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const card = cards.find((c) => c.id === arrastando);
                      setArrastando(null);
                      if (card) pedirMovimento(card, coluna.id);
                    }}
                    className={cn(
                      "flex w-72 shrink-0 flex-col rounded-xl border bg-muted/20",
                      arrastando ? "border-dashed border-primary/40" : "border-border",
                    )}
                  >
                    <header className="flex items-center justify-between border-b border-border/60 px-3 py-2">
                      <h2 className="text-sm font-semibold text-foreground">{coluna.rotulo}</h2>
                      <span className="rounded-full bg-muted px-2 text-xs tabular-nums text-muted-foreground">
                        {daColuna.length}
                      </span>
                    </header>
                    <ol className="flex min-h-24 flex-col gap-2 p-2">
                      {daColuna.map((card) => (
                        <li key={card.id}>
                          <CardQuadro
                            card={card}
                            arrastavel={gestao && card.estagio !== "FECHADO"}
                            onDragStart={() => setArrastando(card.id)}
                            onDragEnd={() => setArrastando(null)}
                            onAbrir={() => setAberto(card)}
                          />
                        </li>
                      ))}
                      {daColuna.length === 0 ? (
                        <li className="px-1 py-4 text-center text-xs text-muted-foreground">Vazio</li>
                      ) : null}
                    </ol>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <NovaOportunidade
          aberto={novoAberto}
          onFechar={() => setNovoAberto(false)}
          onCriada={(c) => {
            setNovoAberto(false);
            atualizarCard(c);
            notifySuccess(`Oportunidade #${c.numero} registrada. O comercial foi avisado.`);
          }}
        />

        <DetalheCard
          card={aberto}
          perfil={perfil}
          clientes={clientes}
          responsaveis={responsaveis}
          pessoas={pessoas}
          onFechar={() => setAberto(null)}
          onAtualizado={atualizarCard}
          onMover={(para) => aberto && pedirMovimento(aberto, para)}
          onApagado={(id) => {
            setAberto(null);
            setCards((l) => l.filter((c) => c.id !== id));
          }}
          confirm={confirm}
        />

        <Dialog open={Boolean(movimento)} onOpenChange={(o) => !o && setMovimento(null)}>
          <DialogContent className="font-sans sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {movimento ? `Mover #${movimento.card.numero} para ${rotuloEstagio(movimento.para)}` : ""}
              </DialogTitle>
            </DialogHeader>
            {movimento ? (
              <div className="space-y-4">
                {movimento.card.estagio === "PENDENTE" && !movimento.card.tipo ? (
                  <div className="space-y-2">
                    <FieldLabel className="font-sans text-sm font-semibold">Tipo da oportunidade</FieldLabel>
                    <select
                      className={SELECT}
                      value={movimento.tipo}
                      onChange={(e) => setMovimento((m) => m && { ...m, tipo: e.target.value as TipoOportunidade })}
                    >
                      <option value="">Escolha…</option>
                      {TIPOS.map((t) => (
                        <option key={t.id} value={t.id}>{t.rotulo}</option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">Você passa a ser o responsável pelo card.</p>
                  </div>
                ) : null}
                {movimento.para === "REPROVADO" ? (
                  <div className="space-y-2">
                    <FieldLabel className="font-sans text-sm font-semibold">Motivo da reprovação</FieldLabel>
                    <select
                      className={SELECT}
                      value={movimento.motivo}
                      onChange={(e) => setMovimento((m) => m && { ...m, motivo: e.target.value as MotivoReprova })}
                    >
                      <option value="">Escolha…</option>
                      {MOTIVOS.map((t) => (
                        <option key={t.id} value={t.id}>{t.rotulo}</option>
                      ))}
                    </select>
                    {movimento.motivo === "OUTRO" ? (
                      <Input
                        placeholder="Descreva o motivo"
                        maxLength={500}
                        value={movimento.motivoTexto}
                        onChange={(e) => setMovimento((m) => m && { ...m, motivoTexto: e.target.value })}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMovimento(null)}>Cancelar</Button>
              <Button type="button" onClick={() => movimento && void executarMovimento(movimento)}>Mover</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <RankingDialog aberto={rankingAberto} onFechar={() => setRankingAberto(false)} />
        {admin ? <ConfigDialog aberto={configAberta} onFechar={() => setConfigAberta(false)} /> : null}
      </AppShell>
    </ProtectedPage>
  );
}

// --- filtros ---------------------------------------------------------------------

function Filtros({
  filtros,
  setFiltros,
  busca,
  setBusca,
  gestao,
  clientes,
  responsaveis,
}: {
  filtros: FiltrosQuadro;
  setFiltros: (f: (x: FiltrosQuadro) => FiltrosQuadro) => void;
  busca: string;
  setBusca: (v: string) => void;
  gestao: boolean;
  clientes: Array<{ id: string; name: string }>;
  responsaveis: Array<{ id: string; name: string }>;
}) {
  const [solicitante, setSolicitante] = useState("");
  useEffect(() => {
    const t = window.setTimeout(
      () => setFiltros((f) => ({ ...f, solicitante: solicitante.trim() || undefined })),
      400,
    );
    return () => window.clearTimeout(t);
  }, [solicitante, setFiltros]);
  const muda = (k: keyof FiltrosQuadro, v: string | boolean) =>
    setFiltros((f) => ({ ...f, [k]: v === "" ? undefined : v }));

  return (
    <div className="grid gap-3 rounded-xl border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="relative lg:col-span-2">
        <span className="sr-only">Buscar</span>
        <Search aria-hidden className="absolute left-3 top-3 size-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por número, título ou cliente"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </label>
      {gestao ? (
        <label className="text-sm">
          <span className="sr-only">Responsável</span>
          <select className={SELECT} value={filtros.responsavelId ?? ""} onChange={(e) => muda("responsavelId", e.target.value)}>
            <option value="">Todos os responsáveis</option>
            <option value="nenhum">Sem responsável</option>
            {responsaveis.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>
      ) : null}
      {gestao ? (
        <label className="text-sm">
          <span className="sr-only">Cliente</span>
          <select className={SELECT} value={filtros.companyId ?? ""} onChange={(e) => muda("companyId", e.target.value)}>
            <option value="">Todos os clientes</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="text-sm">
        <span className="sr-only">Tipo</span>
        <select className={SELECT} value={filtros.tipo ?? ""} onChange={(e) => muda("tipo", e.target.value)}>
          <option value="">Todos os tipos</option>
          {TIPOS.map((t) => (
            <option key={t.id} value={t.id}>{t.rotulo}</option>
          ))}
        </select>
      </label>
      {gestao ? (
        <label className="text-sm">
          <span className="sr-only">Solicitante</span>
          <Input placeholder="Solicitante (nome ou e-mail)" value={solicitante} onChange={(e) => setSolicitante(e.target.value)} />
        </label>
      ) : null}
      <div className="flex items-center gap-2 text-sm">
        <span className="shrink-0 text-muted-foreground">De</span>
        <DatePickerField allowClear placeholder="Criadas a partir de" value={filtros.de ?? ""} onChange={(v) => muda("de", v)} />
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="shrink-0 text-muted-foreground">até</span>
        <DatePickerField allowClear placeholder="Criadas até" align="end" value={filtros.ate ?? ""} onChange={(v) => muda("ate", v)} />
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <FlipCheckbox
          checked={Boolean(filtros.incluirFechados)}
          onChange={(e) => muda("incluirFechados", e.target.checked)}
        />
        Mostrar fechados
      </label>
    </div>
  );
}

// --- card no quadro -----------------------------------------------------------------

function CardQuadro({
  card,
  arrastavel,
  onDragStart,
  onDragEnd,
  onAbrir,
}: {
  card: Oportunidade;
  arrastavel: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onAbrir: () => void;
}) {
  const parado = estaParado(card);
  return (
    <button
      type="button"
      draggable={arrastavel}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", card.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onAbrir}
      className={cn(
        "w-full rounded-lg border bg-card p-3 text-left shadow-sm transition hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-primary",
        parado ? "border-amber-500/50" : "border-border",
        arrastavel && "cursor-grab active:cursor-grabbing",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs tabular-nums text-muted-foreground">#{card.numero}</span>
        {parado ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 text-[11px] font-medium text-amber-700 dark:text-amber-300">
            <AlertTriangle aria-hidden className="size-3" />
            Parado
          </span>
        ) : null}
      </div>
      <p className="mt-1 line-clamp-2 text-sm font-medium text-foreground">{card.titulo}</p>
      {card.cliente ? <p className="mt-1 truncate text-xs text-muted-foreground">{card.cliente.nome}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{rotuloTipo(card.tipo)}</span>
        {card.valorEstimado != null ? (
          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">
            {reais(card.valorEstimado)}
          </span>
        ) : null}
        {card.anexos.length ? (
          <span className="inline-flex items-center gap-0.5 text-muted-foreground">
            <Paperclip aria-hidden className="size-3" />
            {card.anexos.length}
          </span>
        ) : null}
      </div>
      <p className="mt-2 flex justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">{card.responsavel?.nome ?? "Sem responsável"}</span>
        <span className="shrink-0">há {diasDesde(card.estagioDesde)}d</span>
      </p>
    </button>
  );
}

// --- nova oportunidade ----------------------------------------------------------------

function NovaOportunidade({
  aberto,
  onFechar,
  onCriada,
}: {
  aberto: boolean;
  onFechar: () => void;
  onCriada: (c: Oportunidade) => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) {
      setTitulo("");
      setDescricao("");
      setArquivos([]);
    }
  }, [aberto]);

  async function salvar() {
    if (!titulo.trim()) {
      notifyError("Informe o título.");
      return;
    }
    try {
      setSalvando(true);
      onCriada(await oportunidadesService.criar(titulo.trim(), descricao, arquivos));
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Não foi possível registrar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="font-sans flex max-h-[min(84vh,640px)] flex-col overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4">
          <DialogTitle>Nova oportunidade</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="space-y-2">
            <FieldLabel className="font-sans text-sm font-semibold">Título</FieldLabel>
            <Input maxLength={200} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: cliente quer 20 licenças de antivírus" />
          </div>
          <div className="space-y-2">
            <FieldLabel className="font-sans text-sm font-semibold">Descrição</FieldLabel>
            <Textarea rows={5} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="O que o cliente pediu, prazos, contato…" />
          </div>
          <div className="space-y-2">
            <FieldLabel className="font-sans text-sm font-semibold">Anexos (opcional)</FieldLabel>
            <Input type="file" multiple onChange={(e) => setArquivos(Array.from(e.target.files ?? []))} />
          </div>
          <p className="text-xs text-muted-foreground">O card entra em Pendente e o comercial recebe um aviso.</p>
        </div>
        <DialogFooter bleed={false} className="shrink-0 border-t border-border/60 px-6">
          <Button type="button" variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button type="button" disabled={salvando} onClick={() => void salvar()}>
            {salvando ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- detalhe do card --------------------------------------------------------------------

type FormCard = {
  titulo: string;
  descricao: string;
  tipo: TipoOportunidade | "";
  companyId: string;
  clienteNome: string;
  solicitanteUserId: string;
  solicitanteNome: string;
  solicitanteEmail: string;
  responsavelUserId: string;
  valor: string;
  dataRetorno: string;
};

function paraForm(c: Oportunidade): FormCard {
  return {
    titulo: c.titulo,
    descricao: c.descricao,
    tipo: c.tipo ?? "",
    companyId: c.cliente?.companyId ?? "",
    clienteNome: c.cliente && !c.cliente.companyId ? c.cliente.nome : "",
    solicitanteUserId: c.solicitante.userId ?? "",
    solicitanteNome: c.solicitante.userId ? "" : c.solicitante.nome,
    solicitanteEmail: c.solicitante.userId ? "" : (c.solicitante.email ?? ""),
    responsavelUserId: c.responsavel?.id ?? "",
    valor: c.valorEstimado != null ? String(c.valorEstimado).replace(".", ",") : "",
    dataRetorno: c.dataRetorno ?? "",
  };
}

function DetalheCard({
  card,
  perfil,
  clientes,
  responsaveis,
  pessoas,
  onFechar,
  onAtualizado,
  onMover,
  onApagado,
  confirm,
}: {
  card: Oportunidade | null;
  perfil: Perfil;
  clientes: Array<{ id: string; name: string }>;
  responsaveis: Array<{ id: string; name: string }>;
  pessoas: Array<{ id: string; name: string; email?: string }>;
  onFechar: () => void;
  onAtualizado: (c: Oportunidade) => void;
  onMover: (para: Estagio) => void;
  onApagado: (id: string) => void;
  confirm: ReturnType<typeof useConfirm>;
}) {
  const gestao = perfil.admin || perfil.comercial;
  const [form, setForm] = useState<FormCard | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    setForm(card ? paraForm(card) : null);
  }, [card]);

  if (!card || !form) {
    return <Dialog open={false} />;
  }

  const set = (patch: Partial<FormCard>) => setForm((f) => f && { ...f, ...patch });

  async function salvar() {
    if (!card || !form) return;
    const valor = form.valor.trim() ? Number(form.valor.replace(/\./g, "").replace(",", ".")) : null;
    if (valor !== null && (!Number.isFinite(valor) || valor < 0)) {
      notifyError("Valor estimado inválido.");
      return;
    }
    const dados: EdicaoOportunidade = {
      titulo: form.titulo,
      descricao: form.descricao,
      tipo: form.tipo || null,
      valorEstimado: valor,
      dataRetorno: form.dataRetorno || null,
      responsavelUserId: form.responsavelUserId || null,
      ...(form.companyId
        ? { companyId: form.companyId }
        : { companyId: null, clienteNome: form.clienteNome.trim() || null }),
      ...(form.solicitanteUserId
        ? { solicitanteUserId: form.solicitanteUserId }
        : {
            solicitanteUserId: null,
            solicitanteNome: form.solicitanteNome.trim(),
            solicitanteEmail: form.solicitanteEmail.trim() || null,
          }),
    };
    try {
      setSalvando(true);
      onAtualizado(await oportunidadesService.editar(card.id, dados));
      notifySuccess("Oportunidade salva.");
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function reabrir() {
    if (!card) return;
    try {
      onAtualizado(await oportunidadesService.reabrir(card.id));
      notifySuccess("Oportunidade reaberta.");
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Não foi possível reabrir.");
    }
  }

  async function apagar() {
    if (!card) return;
    const ok = await confirm({
      title: `Apagar a oportunidade #${card.numero}?`,
      description: "Ela sai do quadro. O registro fica guardado no banco.",
      confirmText: "Apagar",
      variant: "error",
    });
    if (!ok) return;
    try {
      await oportunidadesService.apagar(card.id);
      onApagado(card.id);
      notifySuccess("Oportunidade apagada.");
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Não foi possível apagar.");
    }
  }

  async function baixar(anexoId: string, nome: string) {
    if (!card) return;
    try {
      const r = await authFetch(buildApiUrl(oportunidadesService.urlAnexo(card.id, anexoId)));
      if (!r.ok) throw new Error("Não foi possível baixar o anexo.");
      const { blob, filename } = await readBlobDownload(r, nome);
      triggerBrowserDownload(blob, filename);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Não foi possível baixar o anexo.");
    }
  }

  async function anexar(arquivos: File[]) {
    if (!card || !arquivos.length) return;
    try {
      setEnviando(true);
      onAtualizado(await oportunidadesService.anexar(card.id, arquivos));
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Não foi possível anexar.");
    } finally {
      setEnviando(false);
    }
  }

  async function removerAnexo(anexoId: string) {
    if (!card) return;
    try {
      onAtualizado(await oportunidadesService.removerAnexo(card.id, anexoId));
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Não foi possível remover.");
    }
  }

  const podeReabrir = card.estagio === "FECHADO" && (gestao || false);
  const leitura = !gestao;

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="font-sans flex max-h-[min(90vh,820px)] flex-col overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4">
          <DialogTitle>
            #{card.numero} · {rotuloEstagio(card.estagio)}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {card.origem === "EMAIL" ? "Veio por e-mail" : "Registrada no portal"} em {dataBr(card.createdAt)} ·
            há {diasDesde(card.estagioDesde)} dia(s) nesta coluna
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {gestao && card.estagio !== "FECHADO" ? (
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-foreground">Mover para</span>
              <select
                className={cn(SELECT, "w-auto")}
                value=""
                onChange={(e) => e.target.value && onMover(e.target.value as Estagio)}
              >
                <option value="">Escolha a coluna…</option>
                {ESTAGIOS.filter(
                  (e) =>
                    e.id !== card.estagio &&
                    e.id !== "PENDENTE" &&
                    (e.id !== "FECHADO" || card.estagio === "APROVADO" || card.estagio === "REPROVADO"),
                ).map((e) => (
                  <option key={e.id} value={e.id}>{e.rotulo}</option>
                ))}
              </select>
            </label>
          ) : null}

          {card.estagio === "REPROVADO" || (card.estagio === "FECHADO" && card.motivoReprova) ? (
            <p className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm">
              Motivo da reprovação: <strong>{MOTIVOS.find((m) => m.id === card.motivoReprova)?.rotulo ?? "—"}</strong>
              {card.motivoReprovaTexto ? ` — ${card.motivoReprovaTexto}` : ""}
            </p>
          ) : null}

          <div className="space-y-2">
            <FieldLabel className="font-sans text-sm font-semibold">Título</FieldLabel>
            <Input disabled={leitura} maxLength={200} value={form.titulo} onChange={(e) => set({ titulo: e.target.value })} />
          </div>
          <div className="space-y-2">
            <FieldLabel className="font-sans text-sm font-semibold">Descrição</FieldLabel>
            <Textarea disabled={leitura} rows={6} value={form.descricao} onChange={(e) => set({ descricao: e.target.value })} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <FieldLabel className="font-sans text-sm font-semibold">Tipo</FieldLabel>
              <select disabled={leitura} className={SELECT} value={form.tipo} onChange={(e) => set({ tipo: e.target.value as TipoOportunidade | "" })}>
                <option value="">Sem tipo</option>
                {TIPOS.map((t) => (
                  <option key={t.id} value={t.id}>{t.rotulo}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <FieldLabel className="font-sans text-sm font-semibold">Valor estimado (R$)</FieldLabel>
              <Input disabled={leitura} inputMode="decimal" placeholder="0,00" value={form.valor} onChange={(e) => set({ valor: e.target.value })} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <FieldLabel className="font-sans text-sm font-semibold">Cliente</FieldLabel>
              {leitura ? (
                <Input disabled value={card.cliente?.nome ?? "—"} />
              ) : (
                <>
                  <select className={SELECT} value={form.companyId} onChange={(e) => set({ companyId: e.target.value })}>
                    <option value="">Empresa nova (digitar o nome)</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {!form.companyId ? (
                    <Input maxLength={200} placeholder="Nome da empresa" value={form.clienteNome} onChange={(e) => set({ clienteNome: e.target.value })} />
                  ) : null}
                </>
              )}
            </div>
            <div className="space-y-2">
              <FieldLabel className="font-sans text-sm font-semibold">Responsável</FieldLabel>
              {leitura ? (
                <Input disabled value={card.responsavel?.nome ?? "Sem responsável"} />
              ) : (
                <select className={SELECT} value={form.responsavelUserId} onChange={(e) => set({ responsavelUserId: e.target.value })}>
                  <option value="">Sem responsável</option>
                  {responsaveis.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <FieldLabel className="font-sans text-sm font-semibold">Solicitante</FieldLabel>
              {leitura ? (
                <Input disabled value={`${card.solicitante.nome}${card.solicitante.email ? ` <${card.solicitante.email}>` : ""}`} />
              ) : (
                <>
                  <select className={SELECT} value={form.solicitanteUserId} onChange={(e) => set({ solicitanteUserId: e.target.value })}>
                    <option value="">Pessoa de fora (digitar)</option>
                    {pessoas.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  {!form.solicitanteUserId ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input maxLength={200} placeholder="Nome" value={form.solicitanteNome} onChange={(e) => set({ solicitanteNome: e.target.value })} />
                      <Input type="email" placeholder="E-mail" value={form.solicitanteEmail} onChange={(e) => set({ solicitanteEmail: e.target.value })} />
                    </div>
                  ) : null}
                </>
              )}
            </div>
            <div className="space-y-2">
              <FieldLabel className="font-sans text-sm font-semibold">Data de retorno do cliente</FieldLabel>
              <DatePickerField modal allowClear disabled={leitura} value={form.dataRetorno} onChange={(v) => set({ dataRetorno: v })} />
              <p className="text-xs text-muted-foreground">Em “Aguardo cliente”, o responsável é lembrado nesse dia.</p>
            </div>
          </div>

          {gestao &&
          (card.estagio === "APROVADO" ||
            (card.estagio === "FECHADO" && card.estagioAnterior === "APROVADO")) ? (
            <ConverterSecao card={card} onAtualizado={onAtualizado} />
          ) : null}

          <div className="space-y-2">
            <FieldLabel className="font-sans text-sm font-semibold">Anexos</FieldLabel>
            {card.anexos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum anexo.</p>
            ) : (
              <ul className="divide-y divide-border/60 rounded-lg border border-border">
                {card.anexos.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">{a.nome}</span>
                    <span className="flex shrink-0 gap-1">
                      <Button type="button" variant="ghost" size="icon" aria-label={`Baixar ${a.nome}`} onClick={() => void baixar(a.id, a.nome)}>
                        <Download className="size-4" />
                      </Button>
                      {gestao ? (
                        <Button type="button" variant="ghost" size="icon" aria-label={`Remover ${a.nome}`} onClick={() => void removerAnexo(a.id)}>
                          <X className="size-4" />
                        </Button>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {gestao ? (
              <Input type="file" multiple disabled={enviando} aria-label="Anexar arquivos" onChange={(e) => void anexar(Array.from(e.target.files ?? []))} />
            ) : null}
          </div>
        </div>

        <DialogFooter bleed={false} className="shrink-0 flex-wrap gap-2 border-t border-border/60 px-6 sm:justify-between">
          <div className="flex gap-2">
            {perfil.admin ? (
              <Button type="button" variant="outline" onClick={() => void apagar()}>
                <Trash2 className="mr-1 size-4" />
                Apagar
              </Button>
            ) : null}
            {podeReabrir ? (
              <Button type="button" variant="outline" onClick={() => void reabrir()}>
                <RotateCcw className="mr-1 size-4" />
                Reabrir
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onFechar}>Fechar</Button>
            {gestao ? (
              <Button type="button" disabled={salvando} onClick={() => void salvar()}>
                {salvando ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Salvar
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- conversão da aprovada -------------------------------------------------------------

function ConverterSecao({
  card,
  onAtualizado,
}: {
  card: Oportunidade;
  onAtualizado: (c: Oportunidade) => void;
}) {
  const [modo, setModo] = useState<"CHAMADO" | "PROJETO" | null>(null);
  const [mesas, setMesas] = useState<Array<{ id: number; nome: string }>>([]);
  const [deskId, setDeskId] = useState("");
  const [unidade, setUnidade] = useState<"HOURS" | "DAYS">("HOURS");
  const [quantidade, setQuantidade] = useState("");
  const [chamado, setChamado] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (modo !== "CHAMADO") return;
    oportunidadesService
      .mesas(card.id)
      .then((m) => {
        setMesas(m);
        if (m.length === 1) setDeskId(String(m[0].id));
      })
      .catch(() => setMesas([]));
  }, [modo, card.id]);

  useEffect(() => {
    setChamado(card.chamadoNumero ? String(card.chamadoNumero) : "");
  }, [card.chamadoNumero]);

  async function converter() {
    try {
      setEnviando(true);
      const novo =
        modo === "CHAMADO"
          ? await oportunidadesService.converter(card.id, {
              destino: "CHAMADO",
              deskId: Number(deskId),
            })
          : await oportunidadesService.converter(card.id, {
              destino: "PROJETO",
              budgetUnit: unidade,
              budgetAmount: Number(quantidade),
              ...(chamado ? { ticketNumber: Number(chamado) } : {}),
            });
      onAtualizado(novo);
      setModo(null);
      notifySuccess(
        modo === "CHAMADO"
          ? `Virou o chamado #${novo.chamadoNumero}.`
          : "Projeto criado.",
      );
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Não foi possível converter.");
    } finally {
      setEnviando(false);
    }
  }

  const semCliente = !card.cliente?.companyId;

  return (
    <section className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
      <h3 className="text-sm font-semibold text-foreground">Oportunidade aprovada</h3>
      <div className="flex flex-wrap gap-2 text-sm">
        {card.chamadoNumero ? (
          <Link className="text-primary underline-offset-2 hover:underline" href={`/tickets/${card.chamadoNumero}`}>
            Chamado #{card.chamadoNumero}
          </Link>
        ) : null}
        {card.projetoId && card.cliente?.companyId ? (
          <Link
            className="text-primary underline-offset-2 hover:underline"
            href={`/projetos/${card.cliente.companyId}/${card.projetoId}`}
          >
            Abrir o projeto
          </Link>
        ) : null}
      </div>
      {semCliente ? (
        <p className="text-xs text-muted-foreground">
          Para virar chamado ou projeto, escolha um cliente cadastrado no campo Cliente e salve.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {!card.chamadoNumero ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setModo("CHAMADO")}>
              Virar chamado
            </Button>
          ) : null}
          {!card.projetoId ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setModo("PROJETO")}>
              Virar projeto
            </Button>
          ) : null}
        </div>
      )}

      {modo === "CHAMADO" ? (
        <div className="space-y-2">
          <FieldLabel className="font-sans text-sm font-semibold">Mesa do chamado</FieldLabel>
          <select className={SELECT} value={deskId} onChange={(e) => setDeskId(e.target.value)}>
            <option value="">Escolha…</option>
            {mesas.map((m) => (
              <option key={m.id} value={m.id}>{m.nome}</option>
            ))}
          </select>
          {mesas.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma mesa liberada para este cliente.</p>
          ) : null}
        </div>
      ) : null}

      {modo === "PROJETO" ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="font-semibold">Orçamento</span>
            <Input inputMode="numeric" placeholder="Ex.: 40" value={quantidade} onChange={(e) => setQuantidade(e.target.value.replace(/\D/g, ""))} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold">Unidade</span>
            <select className={SELECT} value={unidade} onChange={(e) => setUnidade(e.target.value as "HOURS" | "DAYS")}>
              <option value="HOURS">Horas</option>
              <option value="DAYS">Dias</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold">Chamado ligado</span>
            <Input inputMode="numeric" placeholder="Nº do chamado" value={chamado} onChange={(e) => setChamado(e.target.value.replace(/\D/g, ""))} />
          </label>
          <p className="text-xs text-muted-foreground sm:col-span-3">
            Todo projeto fica ligado a um chamado. Sem chamado, vire chamado primeiro.
          </p>
        </div>
      ) : null}

      {modo ? (
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setModo(null)}>Cancelar</Button>
          <Button
            type="button"
            size="sm"
            disabled={enviando || (modo === "CHAMADO" ? !deskId : !quantidade)}
            onClick={() => void converter()}
          >
            {enviando ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Confirmar
          </Button>
        </div>
      ) : null}
    </section>
  );
}

// --- ranking ------------------------------------------------------------------------

function RankingDialog({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const ano = new Date().getFullYear();
  const [de, setDe] = useState(`${ano}-01-01`);
  const [ate, setAte] = useState(`${ano}-12-31`);
  const [dados, setDados] = useState<Ranking | null>(null);

  useEffect(() => {
    if (!aberto) return;
    oportunidadesService
      .ranking(de || undefined, ate || undefined)
      .then(setDados)
      .catch((err) => notifyError(err instanceof Error ? err.message : "Não foi possível ler o ranking."));
  }, [aberto, de, ate]);

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="font-sans flex max-h-[min(86vh,720px)] flex-col overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4">
          <DialogTitle>Ranking de oportunidades</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">De</span>
            <DatePickerField modal allowClear className="w-40" value={de} onChange={setDe} />
            <span className="text-muted-foreground">até</span>
            <DatePickerField modal allowClear align="end" className="w-40" value={ate} onChange={setAte} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <section>
              <h3 className="mb-2 text-sm font-semibold text-foreground">Quem mais traz</h3>
              <ol className="space-y-1 text-sm">
                {(dados?.trazem ?? []).map((t, i) => (
                  <li key={`${t.userId}-${t.nome}`} className="flex justify-between gap-2 rounded-lg bg-muted/30 px-3 py-1.5">
                    <span className="truncate">{i + 1}. {t.nome}</span>
                    <strong className="tabular-nums">{t.total}</strong>
                  </li>
                ))}
                {dados && dados.trazem.length === 0 ? <li className="text-muted-foreground">Nada no período.</li> : null}
              </ol>
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold text-foreground">Quem mais converte (aprovadas)</h3>
              <ol className="space-y-1 text-sm">
                {(dados?.convertem ?? []).map((c, i) => (
                  <li key={c.userId} className="rounded-lg bg-muted/30 px-3 py-1.5">
                    <div className="flex justify-between gap-2">
                      <span className="truncate">{i + 1}. {c.nome}</span>
                      <strong className="tabular-nums">{c.aprovadas}</strong>
                    </div>
                    {c.valorAprovado > 0 ? <p className="text-xs text-muted-foreground">{reais(c.valorAprovado)}</p> : null}
                  </li>
                ))}
                {dados && dados.convertem.length === 0 ? <li className="text-muted-foreground">Nada aprovado no período.</li> : null}
              </ol>
            </section>
          </div>
        </div>
        <DialogFooter bleed={false} className="shrink-0 border-t border-border/60 px-6">
          <Button type="button" variant="outline" onClick={onFechar}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- configuração (admin) ----------------------------------------------------------------

function ConfigDialog({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const [cfg, setCfg] = useState<ConfigOportunidades | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    oportunidadesService.config().then(setCfg).catch(() => setCfg(null));
  }, [aberto]);

  async function salvar() {
    if (!cfg) return;
    try {
      setSalvando(true);
      setCfg(
        await oportunidadesService.salvarConfig({
          caixaEmail: cfg.caixaEmail?.trim() || null,
          leituraAtiva: cfg.leituraAtiva,
          avisarSolicitanteExterno: cfg.avisarSolicitanteExterno,
        }),
      );
      notifySuccess("Configuração salva.");
      onFechar();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="font-sans sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configuração das oportunidades</DialogTitle>
        </DialogHeader>
        {cfg ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <FieldLabel className="font-sans text-sm font-semibold">Caixa de e-mail das oportunidades</FieldLabel>
              <Input type="email" placeholder="oportunidades@alletecnologia.com" value={cfg.caixaEmail ?? ""} onChange={(e) => setCfg({ ...cfg, caixaEmail: e.target.value })} />
              <p className="text-xs text-muted-foreground">Precisa estar liberada no Azure, como a caixa de chamados.</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <FlipCheckbox checked={cfg.leituraAtiva} onChange={(e) => setCfg({ ...cfg, leituraAtiva: e.target.checked })} />
              Ler a caixa e criar cards em Pendente
            </label>
            <label className="flex items-center gap-2 text-sm">
              <FlipCheckbox checked={cfg.avisarSolicitanteExterno} onChange={(e) => setCfg({ ...cfg, avisarSolicitanteExterno: e.target.checked })} />
              Avisar também solicitantes de fora da Alle quando o estágio mudar
            </label>
            {cfg.ultimaLeituraEm ? (
              <p className="text-xs text-muted-foreground">Última leitura: {new Date(cfg.ultimaLeituraEm).toLocaleString("pt-BR")}</p>
            ) : null}
          </div>
        ) : (
          <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button type="button" disabled={salvando || !cfg} onClick={() => void salvar()}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { OportunidadesPageImpl as PortalPageComponent };
