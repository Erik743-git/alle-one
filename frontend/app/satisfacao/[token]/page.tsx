"use client";

import { Suspense } from "react";
import { PesquisaSatisfacao } from "./pesquisa-satisfacao";

export default function SatisfacaoPage() {
  // Suspense porque a nota inicial vem da query string (?nota=4).
  return (
    <Suspense fallback={null}>
      <PesquisaSatisfacao />
    </Suspense>
  );
}
