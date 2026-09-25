"use client";

import { useEffect, useState, type MutableRefObject } from "react";
import { Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { npsService, type ConfigNpsEmpresa } from "@/lib/services/nps.service";

const PAPEL: Record<string, string> = {
  CLIENT_GESTOR: "Gestor",
  CLIENT_MEMBER: "Membro",
  CLIENT: "Cliente",
};

/**
 * NPS da empresa dentro do modal de edição: liga/desliga, intervalo e quem
 * recebe. Salva junto com o "Salvar alterações" do modal (pelo `salvarRef`),
 * e só se algo mudou.
 */
export function NpsEmpresaSecao({
  companyId,
  salvarRef,
}: {
  companyId: string;
  salvarRef: MutableRefObject<(() => Promise<void>) | null>;
}) {
  const [cfg, setCfg] = useState<ConfigNpsEmpresa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ativo, setAtivo] = useState(false);
  const [intervalo, setIntervalo] = useState("3");
  const [escolhidos, setEscolhidos] = useState<string[]>([]);

  useEffect(() => {
    // O modal monta a seção com key={companyId}: trocar de empresa remonta.
    let cancelado = false;
    npsService
      .config(companyId)
      .then((c) => {
        if (cancelado) return;
        setCfg(c);
        setAtivo(c.ativo);
        setIntervalo(String(c.intervaloMeses));
        setEscolhidos(c.destinatarios);
      })
      .catch((err) => {
        if (!cancelado)
          setErro(
            err instanceof Error ? err.message : "Falha ao carregar o NPS.",
          );
      });
    return () => {
      cancelado = true;
    };
  }, [companyId]);

  useEffect(() => {
    salvarRef.current = async () => {
      if (!cfg) return;
      const meses = Number(intervalo);
      const mudou =
        ativo !== cfg.ativo ||
        meses !== cfg.intervaloMeses ||
        escolhidos.length !== cfg.destinatarios.length ||
        escolhidos.some((id) => !cfg.destinatarios.includes(id));
      if (!mudou) return;
      await npsService.salvarConfig(companyId, {
        ativo,
        intervaloMeses: meses,
        destinatarios: escolhidos,
      });
    };
    return () => {
      salvarRef.current = null;
    };
  }, [salvarRef, cfg, ativo, intervalo, escolhidos, companyId]);

  const alternar = (id: string) =>
    setEscolhidos((atual) =>
      atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id],
    );

  return (
    <fieldset className="space-y-3 md:col-span-2">
      <legend className="font-sans text-sm font-medium tracking-normal text-foreground">
        NPS (pesquisa de recomendação)
      </legend>
      {erro ? (
        <p className="text-xs text-rose-500">{erro}</p>
      ) : !cfg ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> Carregando…
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={ativo}
                onCheckedChange={setAtivo}
                aria-label="Participa do NPS"
              />
              Participa do NPS
            </label>
            <label className="flex items-center gap-2 text-sm">
              A cada
              <Input
                type="number"
                min={1}
                max={24}
                value={intervalo}
                onChange={(e) => setIntervalo(e.target.value)}
                className="h-9 w-20"
                aria-label="Intervalo em meses"
              />
              meses
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Quem recebe a pergunta por e-mail (e no pop-up do portal). Só
            usuários do portal desta empresa.
          </p>
          {cfg.pessoas.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Esta empresa ainda não tem usuários no portal.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {cfg.pessoas.map((p) => {
                const marcado = escolhidos.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="checkbox"
                    aria-checked={marcado}
                    onClick={() => alternar(p.id)}
                    className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                      marcado
                        ? "border-primary/40 bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    <span className="block font-medium">{p.nome}</span>
                    <span className="block truncate">
                      {p.email} · {PAPEL[p.papel] ?? p.papel}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}
