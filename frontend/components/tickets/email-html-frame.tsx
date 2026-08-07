"use client";

import { useCallback, useState, type SyntheticEvent } from "react";

import { cn } from "@/lib/utils";

type Props = {
  html: string;
  className?: string;
  title?: string;
};

/** Remove fundos brancos forçados de HTML de e-mail (Outlook/newsletters). */
export function sanitizeEmailHtmlBackground(html: string): string {
  return html
    .replace(/\sbgcolor\s*=\s*(["']?)#?(?:fff(?:fff)?|ffffff|white)\1/gi, "")
    .replace(
      /background(?:-color)?\s*:\s*#?(?:fff(?:fff)?|ffffff|white)\s*;?/gi,
      "",
    )
    .replace(
      /background(?:-color)?\s*:\s*rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)\s*;?/gi,
      "",
    );
}

function wrapSrcDoc(html: string): string {
  const cleaned = sanitizeEmailHtmlBackground(html);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
body{margin:12px;background:transparent!important;color:#e8eaed;font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;}
a{color:#7dd3fc;}
img{max-width:100%;height:auto;}
table{max-width:100%;}
* { background-color: transparent !important; }
td, th, div, p, span, table { color: inherit; }
</style></head><body>${cleaned}</body></html>`;
}

/**
 * Renderiza HTML de e-mail em iframe sandboxed.
 * Fundo alinhado ao tema do portal (sem bloco branco forçado).
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
        "overflow-hidden rounded-md border border-border bg-card/40",
        className,
      )}
    >
      <iframe
        title={title}
        srcDoc={wrapSrcDoc(html)}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
        referrerPolicy="no-referrer"
        className="block w-full border-0 bg-transparent"
        style={{ height }}
        onLoad={onLoad}
      />
    </div>
  );
}
