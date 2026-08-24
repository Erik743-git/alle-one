"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import { activeNodes, findClassificationPath } from "@/lib/classification-path";
import {
  classificationService,
  type ClassificationNode,
} from "@/lib/services/classification.service";

const DEFAULT_LEVEL_LABELS: Record<number, string> = {
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
  serviceDeskId: string | null;
  tree?: ClassificationNode[] | null;
  value: string | null;
  onChange: (classificationId: string | null) => void;
  disabled?: boolean;
  required?: boolean;
  levelLabels?: Record<number, string>;
};

export function ClassificationCascadeFields({
  serviceDeskId,
  tree: treeProp,
  value,
  onChange,
  disabled = false,
  required = false,
  levelLabels = DEFAULT_LEVEL_LABELS,
}: Props) {
  const [tree, setTree] = useState<ClassificationNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [level1Id, setLevel1Id] = useState("");
  const [level2Id, setLevel2Id] = useState("");
  const [level3Id, setLevel3Id] = useState("");

  useEffect(() => {
    if (treeProp != null) {
      setTree(treeProp);
      setLoading(false);
      return;
    }

    if (!serviceDeskId) {
      setTree([]);
      setLevel1Id("");
      setLevel2Id("");
      setLevel3Id("");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        const data = await classificationService.getTree(serviceDeskId);
        if (!cancelled) setTree(data.tree ?? []);
      } catch {
        if (!cancelled) setTree([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [serviceDeskId, treeProp]);

  useEffect(() => {
    if (!value || tree.length === 0) {
      if (!value) {
        setLevel1Id("");
        setLevel2Id("");
        setLevel3Id("");
      }
      return;
    }
    const path = findClassificationPath(tree, value);
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
    // Só emite folha: se ainda há subnível visível, fica incompleto (null).
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

  if (!serviceDeskId) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2">
        <Loader2 className="size-4 animate-spin" />
        Carregando classificação...
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <p className="text-xs text-muted-foreground sm:col-span-2">
        Nenhuma classificação cadastrada para este catálogo em Administração →
        Classificação.
      </p>
    );
  }

  return (
    <>
      <div className="space-y-2 sm:col-span-2">
        <p className="text-xs font-semibold text-muted-foreground">
          Classificação
          {required ? <span className="text-destructive"> *</span> : null}
        </p>
        {required ? (
          <p className="text-xs text-muted-foreground">
            Selecione até o último nível disponível.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted-foreground">
          {levelLabels[1]}
          {required ? <span className="text-destructive"> *</span> : null}
        </label>
        <SearchableSelectField
          value={level1Id}
          onChange={handleLevel1Change}
          options={level1Options}
          emptyLabel="Selecione..."
          disabled={disabled || level1Options.length === 0}
        />
      </div>

      {level1Id && level2Options.length > 0 ? (
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground">
            {levelLabels[2]}
            {required ? <span className="text-destructive"> *</span> : null}
          </label>
          <SearchableSelectField
            value={level2Id}
            onChange={handleLevel2Change}
            options={level2Options}
            emptyLabel="Selecione..."
            disabled={disabled}
          />
        </div>
      ) : null}

      {level2Id && level3Options.length > 0 ? (
        <div className="space-y-2 sm:col-span-2">
          <label className="text-xs font-semibold text-muted-foreground">
            {levelLabels[3]}
            {required ? <span className="text-destructive"> *</span> : null}
          </label>
          <SearchableSelectField
            value={level3Id}
            onChange={handleLevel3Change}
            options={level3Options}
            emptyLabel="Selecione..."
            disabled={disabled}
          />
        </div>
      ) : null}
    </>
  );
}
