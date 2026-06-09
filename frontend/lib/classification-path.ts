import type { ClassificationNode } from "@/lib/services/classification.service";

export type ContractClassificationRef = {
  id: string;
  name: string;
  level: number;
  serviceDesk?: { id: string; name: string } | null;
  parent?: ContractClassificationRef | null;
};

export function findClassificationPath(
  tree: ClassificationNode[],
  targetId: string,
): string[] {
  const path: string[] = [];

  function walk(nodes: ClassificationNode[]): boolean {
    for (const node of nodes) {
      path.push(node.id);
      if (node.id === targetId) return true;
      if (walk(node.children)) return true;
      path.pop();
    }
    return false;
  }

  return walk(tree) ? path : [];
}

export function formatClassificationPath(
  classification: ContractClassificationRef | null | undefined,
): string {
  if (!classification) return "—";

  const parts: string[] = [];
  if (classification.serviceDesk?.name) {
    parts.push(classification.serviceDesk.name);
  }

  const chain: ContractClassificationRef[] = [];
  let cursor: ContractClassificationRef | null | undefined = classification;
  while (cursor) {
    chain.unshift(cursor);
    cursor = cursor.parent ?? null;
  }

  for (const item of chain) {
    parts.push(item.name);
  }

  return parts.join(" → ");
}

export function activeNodes(nodes: ClassificationNode[]): ClassificationNode[] {
  return nodes.filter((node) => node.active);
}
