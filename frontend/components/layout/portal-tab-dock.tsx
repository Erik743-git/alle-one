"use client";

import { useEffect, useRef } from "react";

let dockNode: HTMLDivElement | null = null;
const listeners = new Set<() => void>();

function setDock(node: HTMLDivElement | null) {
  dockNode = node;
  listeners.forEach((listener) => listener());
}

export function subscribeDock(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDockNode() {
  return dockNode;
}

/**
 * Vive dentro do `<main>` de cada página real (remontada a cada navegação
 * pelo Next) e se anuncia como "onde a guia ativa deve aparecer agora".
 * `PortalTabHost`, que é persistente, portala o conteúdo da guia ativa
 * para dentro deste elemento.
 */
export function PortalTabDock() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    setDock(node);
    return () => {
      if (dockNode === node) setDock(null);
    };
  }, []);

  return <div ref={ref} className="min-w-0" />;
}
