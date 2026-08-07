"use client";

import { useRef, useState } from "react";
import { FileText, Loader2, Paperclip, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PROJECT_BUDGET_UNIT_LABELS,
  projetosService,
  type ProjectBudgetUnit,
} from "@/lib/services/projetos.service";

const ACCEPT_DOCS =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type Props = {
  companyId: string;
  onCreated: (projectId: string) => void;
};

export function ProjectCreateCard({ companyId, onCreated }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [budgetUnit, setBudgetUnit] = useState<ProjectBudgetUnit>("HOURS");
  const [budgetAmount, setBudgetAmount] = useState("40");
  const [ticketNumber, setTicketNumber] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      if (!next.some((f) => f.name === file.name && f.size === file.size)) {
        next.push(file);
      }
    }
    setFiles(next);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit() {
    if (!name.trim()) return;
    const amount = Number(budgetAmount);
    const ticket = Number(ticketNumber);
    if (!Number.isFinite(amount) || amount < 1) {
      setError("Informe um orçamento válido (mínimo 1).");
      return;
    }
    if (!Number.isFinite(ticket) || ticket < 1) {
      setError("Informe o número do ticket vinculado ao projeto.");
      return;
    }
    try {
      setCreating(true);
      setError(null);
      const project = await projetosService.createProject(
        companyId,
        {
          name: name.trim(),
          description: description.trim() || undefined,
          budgetUnit,
          budgetAmount: amount,
          ticketNumber: ticket,
        },
        files.length ? files : undefined,
      );
      onCreated(project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar projeto.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Plus className="h-5 w-5 text-primary" />
          Novo projeto
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="project-name">Nome do projeto</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Portal AlleOne — Evoluções"
              className="h-11"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="project-desc">Descrição</Label>
            <Textarea
              id="project-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Objetivo e escopo do projeto..."
              className="min-h-[72px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-ticket">Ticket vinculado</Label>
            <Input
              id="project-ticket"
              type="number"
              min={1}
              value={ticketNumber}
              onChange={(e) => setTicketNumber(e.target.value)}
              placeholder="Ex.: 12345"
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">
              Cada projeto fica ligado a um único chamado do portal.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="budget-unit">Orçamento em</Label>
            <select
              id="budget-unit"
              value={budgetUnit}
              onChange={(e) => setBudgetUnit(e.target.value as ProjectBudgetUnit)}
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {(Object.keys(PROJECT_BUDGET_UNIT_LABELS) as ProjectBudgetUnit[]).map(
                (unit) => (
                  <option key={unit} value={unit}>
                    {PROJECT_BUDGET_UNIT_LABELS[unit]}
                  </option>
                ),
              )}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="budget-amount">Quantidade prevista</Label>
            <Input
              id="budget-amount"
              type="number"
              min={1}
              value={budgetAmount}
              onChange={(e) => setBudgetAmount(e.target.value)}
              className="h-11"
            />
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-dashed p-4">
          <div className="flex items-center justify-between gap-2">
            <Label className="flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-muted-foreground" />
              Documentação (PDF ou Word)
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Anexar
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_DOCS}
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>
          {files.length ? (
            <ul className="space-y-1.5">
              {files.map((file) => (
                <li
                  key={`${file.name}-${file.size}`}
                  className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-primary" />
                    <span className="truncate">{file.name}</span>
                  </span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      setFiles((prev) =>
                        prev.filter(
                          (f) => !(f.name === file.name && f.size === file.size),
                        ),
                      )
                    }
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              Opcional: escopo, proposta ou especificação do projeto.
            </p>
          )}
        </div>

        {error ? <p className="text-sm text-rose-500">{error}</p> : null}

        <Button
          type="button"
          disabled={creating || !name.trim()}
          onClick={() => void handleSubmit()}
        >
          {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Criar projeto
        </Button>
      </CardContent>
    </Card>
  );
}
