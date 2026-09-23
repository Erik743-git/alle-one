"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { getCurrentRole } from "@/lib/access-control";

/**
 * Tira da tela quem não pode estar nela (ex.: cliente que digitou /mural).
 *
 * O menu já esconde o item, e a API recusa os dados (403); isto só evita a
 * tela vazia com "Sem permissão". Enquanto a sessão carrega (papel ainda
 * desconhecido) não decide nada, para não expulsar quem tem acesso.
 *
 * Devolve true quando a pessoa não tem acesso: a página não deve buscar dados.
 */
export function useExigirAcesso(
  podeAcessar: () => boolean,
  destino = "/dashboard",
): boolean {
  const router = useRouter();
  const semAcesso = getCurrentRole() !== null && !podeAcessar();

  useEffect(() => {
    if (semAcesso) router.replace(destino);
  }, [semAcesso, destino, router]);

  return semAcesso;
}
