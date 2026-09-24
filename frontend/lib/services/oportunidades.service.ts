import { apiRequest } from "@/lib/api";

export type Estagio =
  | "PENDENTE"
  | "EM_ANALISE"
  | "PROPOSTA"
  | "AGUARDO_CLIENTE"
  | "APROVADO"
  | "REPROVADO"
  | "FECHADO";

export type TipoOportunidade =
  | "PRODUTO"
  | "CONTRATO"
  | "SERVICO_AVULSO"
  | "PROSPECCAO";

export type MotivoReprova = "PRECO" | "CONCORRENTE" | "DESISTENCIA" | "OUTRO";

export const ESTAGIOS: Array<{ id: Estagio; rotulo: string }> = [
  { id: "PENDENTE", rotulo: "Pendente" },
  { id: "EM_ANALISE", rotulo: "Em análise" },
  { id: "PROPOSTA", rotulo: "Proposta em elaboração" },
  { id: "AGUARDO_CLIENTE", rotulo: "Aguardo cliente/Enviado" },
  { id: "APROVADO", rotulo: "Aprovado" },
  { id: "REPROVADO", rotulo: "Reprovado" },
  { id: "FECHADO", rotulo: "Fechado" },
];

export const TIPOS: Array<{ id: TipoOportunidade; rotulo: string }> = [
  { id: "PRODUTO", rotulo: "Produto" },
  { id: "CONTRATO", rotulo: "Contrato" },
  { id: "SERVICO_AVULSO", rotulo: "Serviço avulso" },
  { id: "PROSPECCAO", rotulo: "Prospecção" },
];

export const MOTIVOS: Array<{ id: MotivoReprova; rotulo: string }> = [
  { id: "PRECO", rotulo: "Preço" },
  { id: "CONCORRENTE", rotulo: "Fechou com concorrente" },
  { id: "DESISTENCIA", rotulo: "Cliente desistiu" },
  { id: "OUTRO", rotulo: "Outro" },
];

export type Oportunidade = {
  id: string;
  numero: number;
  titulo: string;
  descricao: string;
  estagio: Estagio;
  estagioAnterior: Estagio | null;
  estagioDesde: string;
  ultimaMovimentacao: string;
  tipo: TipoOportunidade | null;
  origem: "EMAIL" | "PORTAL";
  solicitante: { userId: string | null; nome: string; email: string | null };
  cliente: { companyId: string | null; nome: string } | null;
  responsavel: { id: string; nome: string } | null;
  valorEstimado: number | null;
  motivoReprova: MotivoReprova | null;
  motivoReprovaTexto: string | null;
  dataRetorno: string | null;
  fechadoEm: string | null;
  createdAt: string;
  /** Conversão da aprovada. */
  projetoId: string | null;
  chamadoNumero: number | null;
  anexos: Array<{
    id: string;
    fileId: string;
    nome: string;
    mimeType: string;
    tamanho: number;
  }>;
};

export type Perfil = { admin: boolean; comercial: boolean };

export type FiltrosQuadro = {
  responsavelId?: string;
  solicitante?: string;
  companyId?: string;
  estagios?: Estagio[];
  tipo?: TipoOportunidade;
  de?: string;
  ate?: string;
  incluirFechados?: boolean;
  busca?: string;
};

export type EdicaoOportunidade = Partial<{
  titulo: string;
  descricao: string;
  tipo: TipoOportunidade | null;
  solicitanteUserId: string | null;
  solicitanteNome: string;
  solicitanteEmail: string | null;
  companyId: string | null;
  clienteNome: string | null;
  valorEstimado: number | null;
  dataRetorno: string | null;
  responsavelUserId: string | null;
}>;

export type Ranking = {
  periodo: { de: string | null; ate: string | null };
  trazem: Array<{ userId: string | null; nome: string; total: number }>;
  convertem: Array<{
    userId: string;
    nome: string;
    aprovadas: number;
    valorAprovado: number;
  }>;
};

export type ConfigOportunidades = {
  caixaEmail: string | null;
  leituraAtiva: boolean;
  avisarSolicitanteExterno: boolean;
  ultimaLeituraEm: string | null;
};

type Pessoa = { id: string; name: string; email?: string };

function query(filtros: FiltrosQuadro): string {
  const p = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtros)) {
    if (valor === undefined || valor === "" || valor === false) continue;
    p.set(chave, Array.isArray(valor) ? valor.join(",") : String(valor));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const oportunidadesService = {
  quadro(filtros: FiltrosQuadro) {
    return apiRequest<{ perfil: Perfil; cards: Oportunidade[] }>(
      `/oportunidades${query(filtros)}`,
    );
  },
  obter(id: string) {
    return apiRequest<Oportunidade>(`/oportunidades/${id}`);
  },
  contador() {
    return apiRequest<{ ano: number; total: number }>("/oportunidades/contador");
  },
  ranking(de?: string, ate?: string) {
    return apiRequest<Ranking>(`/oportunidades/ranking${query({ de, ate })}`);
  },
  responsaveis() {
    return apiRequest<Pessoa[]>("/oportunidades/responsaveis");
  },
  clientes() {
    return apiRequest<Pessoa[]>("/oportunidades/clientes");
  },
  pessoas() {
    return apiRequest<Pessoa[]>("/oportunidades/pessoas");
  },
  criar(titulo: string, descricao: string, arquivos: File[]) {
    const form = new FormData();
    form.append("titulo", titulo);
    form.append("descricao", descricao);
    for (const f of arquivos) form.append("arquivos", f);
    return apiRequest<Oportunidade>("/oportunidades", {
      method: "POST",
      body: form,
    });
  },
  editar(id: string, dados: EdicaoOportunidade) {
    return apiRequest<Oportunidade>(`/oportunidades/${id}`, {
      method: "PATCH",
      body: dados,
    });
  },
  mover(
    id: string,
    dados: {
      para: Estagio;
      tipo?: TipoOportunidade;
      motivoReprova?: MotivoReprova;
      motivoReprovaTexto?: string;
    },
  ) {
    return apiRequest<Oportunidade>(`/oportunidades/${id}/mover`, {
      method: "POST",
      body: dados,
    });
  },
  reabrir(id: string) {
    return apiRequest<Oportunidade>(`/oportunidades/${id}/reabrir`, {
      method: "POST",
    });
  },
  apagar(id: string) {
    return apiRequest<{ ok: true }>(`/oportunidades/${id}`, {
      method: "DELETE",
    });
  },
  anexar(id: string, arquivos: File[]) {
    const form = new FormData();
    for (const f of arquivos) form.append("arquivos", f);
    return apiRequest<Oportunidade>(`/oportunidades/${id}/anexos`, {
      method: "POST",
      body: form,
    });
  },
  removerAnexo(id: string, anexoId: string) {
    return apiRequest<Oportunidade>(`/oportunidades/${id}/anexos/${anexoId}`, {
      method: "DELETE",
    });
  },
  urlAnexo(id: string, anexoId: string) {
    return `/oportunidades/${id}/anexos/${anexoId}`;
  },
  mesas(id: string) {
    return apiRequest<Array<{ id: number; nome: string }>>(
      `/oportunidades/${id}/mesas`,
    );
  },
  converter(
    id: string,
    dados:
      | { destino: "CHAMADO"; deskId: number }
      | {
          destino: "PROJETO";
          budgetUnit: "HOURS" | "DAYS";
          budgetAmount: number;
          ticketNumber?: number;
        },
  ) {
    return apiRequest<Oportunidade>(`/oportunidades/${id}/converter`, {
      method: "POST",
      body: dados,
    });
  },
  config() {
    return apiRequest<ConfigOportunidades>("/oportunidades/config");
  },
  salvarConfig(dados: Partial<ConfigOportunidades>) {
    return apiRequest<ConfigOportunidades>("/oportunidades/config", {
      method: "PUT",
      body: dados,
    });
  },
};
