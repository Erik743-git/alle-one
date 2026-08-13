"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import {
  activeNodes,
  findClassificationPath,
} from "@/lib/classification-path";
import {
  classificationService,
  type ClassificationNode,
  type ServiceDeskOption,
} from "@/lib/services/classification.service";

const LEVEL_LABELS: Record<number, string> = {
  1: "Categoria",
  2: "Subcategoria",
  3: "Produto/solução",
};

function findNodeById(
  nodes: ClassificationNode[],
  targetId: string,
): ClassificationNode | null {
  for (const node of nodes) {
    if (node.id === targetId) return node;
    const nested = findNodeById(node.children, targetId);
    if (nested) return nested;
  }
  return null;
}

type Props = {
  value: string | null;
  onChange: (classificationId: string | null) => void;
  disabled?: boolean;
};

export function ContractClassificationPicker({
  value,
  onChange,
  disabled = false,
}: Props) {
  const [desks, setDesks] = useState<ServiceDeskOption[]>([]);
  const [desksLoading, setDesksLoading] = useState(true);
  const [deskId, setDeskId] = useState("");
  const [tree, setTree] = useState<ClassificationNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [level1Id, setLevel1Id] = useState("");
  const [level2Id, setLevel2Id] = useState("");
  const [level3Id, setLevel3Id] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setDesksLoading(true);
        const list = await classificationService.listDesks();
        if (!cancelled) setDesks(list ?? []);
      } catch {
        if (!cancelled) setDesks([]);
      } finally {
        if (!cancelled) setDesksLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!deskId) {
      setTree([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        setTreeLoading(true);
        const data = await classificationService.getTree(deskId);
        if (!cancelled) setTree(data.tree ?? []);
      } catch {
        if (!cancelled) setTree([]);
      } finally {
        if (!cancelled) setTreeLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [deskId]);

  useEffect(() => {
    if (!value || tree.length === 0) return;
    const path = findClassificationPath(tree, value);
    if (path.length === 0) return;
    setLevel1Id(path[0] ?? "");
    setLevel2Id(path[1] ?? "");
    setLevel3Id(path[2] ?? "");
  }, [value, tree]);

  const level1Options = useMemo(
    () =>
      activeNodes(tree).map((node) => ({
        value: node.id,
        label: node.name,
      })),
    [tree],
  );

  const level2Options = useMemo(() => {
    const parent = findNodeById(tree, level1Id);
    if (!parent) return [];
    return activeNodes(parent.children).map((node) => ({
      value: node.id,
      label: node.name,
    }));
  }, [tree, level1Id]);

  const level3Options = useMemo(() => {
    const parent = findNodeById(tree, level2Id);
    if (!parent) return [];
    return activeNodes(parent.children).map((node) => ({
      value: node.id,
      label: node.name,
    }));
  }, [tree, level2Id]);

  function emitSelection(l1: string, l2: string, l3: string) {
    if (l1 && !l2) {
      const parent = findNodeById(tree, l1);
      if (parent && activeNodes(parent.children).length > 0) {
        onChange(null);
        return;
      }
    }
    if (l2 && !l3) {
      const parent = findNodeById(tree, l2);
      if (parent && activeNodes(parent.children).length > 0) {
        onChange(null);
        return;
      }
    }
    onChange(l3 || l2 || l1 || null);
  }

  function handleDeskChange(nextDeskId: string) {
    setDeskId(nextDeskId);
    setLevel1Id("");
    setLevel2Id("");
    setLevel3Id("");
    onChange(null);
  }

  function handleLevel1Change(next: string) {
    setLevel1Id(next);
    setLevel2Id("");
    setLevel3Id("");
    emitSelection(next, "", "");
  }

  function handleLevel2Change(next: string) {
    setLevel2Id(next);
    setLevel3Id("");
    emitSelection(level1Id, next, "");
  }

  function handleLevel3Change(next: string) {
    setLevel3Id(next);
    emitSelection(level1Id, level2Id, next);
  }

  useEffect(() => {
    if (!value || deskId || desks.length === 0) return;
    void (async () => {
      for (const desk of desks) {
        try {
          const data = await classificationService.getTree(desk.id);
          const path = findClassificationPath(data.tree ?? [], value);
          if (path.length > 0) {
            setDeskId(desk.id);
            break;
          }
        } catch {
          /* tenta próxima mesa */
        }
      }
    })();
  }, [value, deskId, desks]);

  const loading = desksLoading || treeLoading;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4 md:col-span-2">
      <div className="space-y-1">
        <p className="text-xs font-semibold text-muted-foreground">
          Classificação do contrato
        </p>
        <p className="text-xs text-muted-foreground">
          Selecione a mesa e o caminho cadastrado em Administração →
          Classificação.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando classificações...
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">
            Mesa
          </label>
          <SearchableSelectField
            value={deskId}
            onChange={handleDeskChange}
            options={desks.map((desk) => ({
              value: desk.id,
              label: desk.name,
            }))}
            emptyLabel="Selecione a mesa..."
            disabled={disabled || desksLoading}
            className="h-10"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">
            {LEVEL_LABELS[1]}
          </label>
          <SearchableSelectField
            value={level1Id}
            onChange={handleLevel1Change}
            options={level1Options}
            emptyLabel={
              deskId ? "Selecione a categoria..." : "Escolha a mesa antes"
            }
            disabled={disabled || !deskId || level1Options.length === 0}
            className="h-10"
          />
        </div>

        {level1Id && level2Options.length > 0 ? (
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">
              {LEVEL_LABELS[2]}
            </label>
            <SearchableSelectField
              value={level2Id}
              onChange={handleLevel2Change}
              options={level2Options}
              emptyLabel="Selecione a subcategoria..."
              disabled={disabled}
              className="h-10"
            />
          </div>
        ) : null}

        {level2Id && level3Options.length > 0 ? (
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">
              {LEVEL_LABELS[3]}
            </label>
            <SearchableSelectField
              value={level3Id}
              onChange={handleLevel3Change}
              options={level3Options}
              emptyLabel="Selecione o produto/solução..."
              disabled={disabled}
              className="h-10"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
