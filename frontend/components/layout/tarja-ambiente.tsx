"use client";

import { useEffect, useState } from "react";

import { ehAmbienteDeTeste } from "@/lib/ambiente";

/**
 * Tarja do ambiente de teste: moldura âmbar em volta da tela e um selo fixo
 * embaixo. Não mexe no layout nem bloqueia clique (pointer-events-none).
 * Existe para ninguém confundir a teste com a produção.
 */
export function TarjaAmbiente() {
  const [teste, setTeste] = useState(false);

  // Depende do endereço, que só existe no navegador.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTeste(ehAmbienteDeTeste());
  }, []);

  if (!teste) return null;
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[400] border-[3px] border-amber-500"
      />
      <div
        role="note"
        className="pointer-events-none fixed bottom-2 left-1/2 z-[400] -translate-x-1/2 whitespace-nowrap rounded-full bg-amber-500 px-3 py-1 text-xs font-bold uppercase tracking-wide text-black shadow-lg"
      >
        Ambiente de teste
        <span className="hidden sm:inline"> · dados não são reais</span>
      </div>
    </>
  );
}
