import { apiRequest } from "@/lib/api";

/** Cores de papel oferecidas na tela; o servidor recusa qualquer outra. */
export const MURAL_CORES = [
  "amarelo",
  "rosa",
  "verde",
  "azul",
  "lilas",
  "laranja",
] as const;
export type MuralCor = (typeof MURAL_CORES)[number];

/** Reações oferecidas; o servidor recusa qualquer outra. */
export const MURAL_REACOES = ["👏", "❤️", "😄", "🙌"] as const;

export type MuralNote = {
  id: string;
  message: string;
  color: string;
  /** Posição na parede, de 0 a 1 — o mural fica igual em qualquer tela. */
  x: number;
  y: number;
  rotation: number;
  anonymous: boolean;
  /** Null em bilhete anônimo: o servidor não manda o autor, nem para admin. */
  authorName: string | null;
  toName: string | null;
  createdAt: string;
  mine: boolean;
  canDelete: boolean;
  reactions: Array<{ emoji: string; count: number; mine: boolean }>;
  /** Chegou depois da última vez que você abriu o mural. */
  isNew: boolean;
};

export type MuralNoteInput = {
  message: string;
  color?: string;
  toUserId?: string | null;
  anonymous?: boolean;
  x?: number;
  y?: number;
  rotation?: number;
};

export const muralService = {
  list() {
    return apiRequest<MuralNote[]>("/mural/notes");
  },
  colegas() {
    return apiRequest<Array<{ id: string; name: string }>>("/mural/colegas");
  },
  create(data: MuralNoteInput) {
    return apiRequest<MuralNote>("/mural/notes", {
      method: "POST",
      body: data,
    });
  },
  update(id: string, data: Partial<MuralNoteInput>) {
    return apiRequest<MuralNote>(`/mural/notes/${id}`, {
      method: "PATCH",
      body: data,
    });
  },
  reagir(id: string, emoji: string) {
    return apiRequest<MuralNote>(`/mural/notes/${id}/reacoes`, {
      method: "POST",
      body: { emoji },
    });
  },
  doMes(mes?: string) {
    return apiRequest<{
      mes: string;
      ranking: Array<{ name: string; total: number }>;
      total: number;
    }>(`/mural/do-mes${mes ? `?mes=${mes}` : ""}`);
  },
  remove(id: string) {
    return apiRequest<{ ok: true }>(`/mural/notes/${id}`, { method: "DELETE" });
  },
};
