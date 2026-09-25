import { apiRequest } from "@/lib/api";

export type PerfilAcesso =
  | "COLLABORATOR"
  | "PJ"
  | "CLIENT_GESTOR"
  | "CLIENT_MEMBER";

export type LinhaAcesso = {
  chave: string;
  nome: string;
  perfisPossiveis: PerfilAcesso[];
  emConstrucao: boolean;
  colaborador: boolean;
  terceiro: boolean;
  clienteGestor: boolean;
  clienteMembro: boolean;
  updatedAt: string | null;
};

export type CampoPerfil =
  | "colaborador"
  | "terceiro"
  | "clienteGestor"
  | "clienteMembro";

export const COLUNAS_PERFIL: Array<{
  campo: CampoPerfil;
  perfil: PerfilAcesso;
  rotulo: string;
}> = [
  { campo: "colaborador", perfil: "COLLABORATOR", rotulo: "Colaborador" },
  { campo: "terceiro", perfil: "PJ", rotulo: "Terceiro (PJ)" },
  { campo: "clienteGestor", perfil: "CLIENT_GESTOR", rotulo: "Cliente gestor" },
  { campo: "clienteMembro", perfil: "CLIENT_MEMBER", rotulo: "Cliente membro" },
];

export const acessoService = {
  listar() {
    return apiRequest<LinhaAcesso[]>("/admin/acesso-modulos");
  },
  salvar(linha: LinhaAcesso) {
    return apiRequest<LinhaAcesso[]>("/admin/acesso-modulos", {
      method: "PUT",
      body: {
        chave: linha.chave,
        emConstrucao: linha.emConstrucao,
        colaborador: linha.colaborador,
        terceiro: linha.terceiro,
        clienteGestor: linha.clienteGestor,
        clienteMembro: linha.clienteMembro,
      },
    });
  },
};
