"use client";

import { useCallback, useState, type SyntheticEvent } from "react";

import { cn } from "@/lib/utils";

type Props = {
  html: string;
  className?: string;
  title?: string;
};

/**
 * Renderiza HTML de e-mail em iframe sandboxed para não quebrar o layout do portal
 * (tabelas largas, CSS do remetente, fundo branco de newsletters, etc.).
 */
export function EmailHtmlFrame({
  html,
  className,
  title = "Conteúdo do e-mail",
}: Props) {
  const [height, setHeight] = useState(420);

  const onLoad = useCallback((e: SyntheticEvent<HTMLIFrameElement>) => {
    const doc = e.currentTarget.contentDocument;
    if (!doc?.body) return;
    const h = Math.max(
      280,
      Math.min(doc.body.scrollHeight + 24, 1200),
    );
    setHeight(h);
  }, []);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-border bg-white",
        className,
      )}
    >
      <iframe
        title={title}
        srcDoc={html}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
        referrerPolicy="no-referrer"
        className="block w-full border-0 bg-white"
        style={{ height }}
        onLoad={onLoad}
      />
    </div>
  );
}
