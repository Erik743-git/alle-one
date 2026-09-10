"use client";

import { useCallback, useEffect, useState, type SyntheticEvent } from "react";

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

function wrapSrcDoc(html: string, dark: boolean): string {
  const cleaned = sanitizeEmailHtmlBackground(html);
  const texto = dark ? "#e8eaed" : "#1f2328";
  const link = dark ? "#7dd3fc" : "#0b6bcb";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
/* Sem esta declaração o documento do iframe cai no color-scheme "light"
   padrão — mesmo com o portal em tema escuro — e o navegador pinta a tela
   dele de branco. O texto claro daqui virava cinza ilegível sobre branco,
   e nenhuma regra de background resolvia, porque a cor vem da tela do
   documento, não de um elemento. */
html{color-scheme:${dark ? "dark" : "light"};background:transparent!important;}
body{margin:12px;background:transparent!important;color:${texto};font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;}
a{color:${link};}
img{max-width:100%;height:auto;}
table{max-width:100%;}
* { background-color: transparent !important; }
td, th, div, p, span, table { color: inherit; }
</style></head><body>${cleaned}</body></html>`;
}

/** Acompanha o tema do portal (`html.dark`), inclusive quando o usuário troca. */
function useTemaEscuro(): boolean {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const raiz = document.documentElement;
    const atualizar = () => setDark(raiz.classList.contains("dark"));
    atualizar();
    const observador = new MutationObserver(atualizar);
    observador.observe(raiz, { attributes: true, attributeFilter: ["class"] });
    return () => observador.disconnect();
  }, []);

  return dark;
}

/**
 * Renderiza HTML de e-mail em iframe sandboxed.
 * Fundo e cor de texto acompanham o tema do portal.
 */
export function EmailHtmlFrame({
  html,
  className,
  title = "Conteúdo do e-mail",
}: Props) {
  const [height, setHeight] = useState(420);
  const dark = useTemaEscuro();

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
        srcDoc={wrapSrcDoc(html, dark)}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
        referrerPolicy="no-referrer"
        className="block w-full border-0 bg-transparent"
        style={{ height }}
        onLoad={onLoad}
      />
    </div>
  );
}
