"use client";

import { Suspense } from "react";
import { PesquisaNps } from "./pesquisa-nps";

export default function NpsPage() {
  // Suspense porque a nota inicial vem da query string (?nota=9).
  return (
    <Suspense fallback={null}>
      <PesquisaNps />
    </Suspense>
  );
}
