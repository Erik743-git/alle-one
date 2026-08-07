/** Aviso ao editar GMUD já aprovada (exige novo ciclo de aprovação). */
export const GMUD_REAPPROVAL_WARNING =
  "Esta GMUD já está aprovada. Se você editar e salvar, ela volta para pendente de aprovação e todos os aprovadores precisarão aprovar novamente.";

export function gmudRequiresReapproval(status: string | null | undefined) {
  return status === "APPROVED";
}

export function canEditGmud(status: string | null | undefined) {
  return (
    status === "DRAFT" ||
    status === "PENDING_APPROVAL" ||
    status === "APPROVED"
  );
}
