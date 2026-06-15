import {
  formatApprovedAt,
  type BulkApprovalStatus,
} from "@/lib/apontamentos/bulk-approval";

type Props = {
  status: BulkApprovalStatus;
  approvedByName: string | null;
  approvedAt: string | null;
};

export function ApprovalAuditCell({
  status,
  approvedByName,
  approvedAt,
}: Props) {
  if (status === "PENDING") {
    return <span className="text-muted-foreground">—</span>;
  }

  if (status === "REJECTED") {
    return (
      <div className="text-xs">
        <p className="font-medium text-rose-600 dark:text-rose-400">Não aprovada</p>
        {approvedByName ? (
          <p className="text-muted-foreground">por {approvedByName}</p>
        ) : null}
        <p className="text-muted-foreground">{formatApprovedAt(approvedAt)}</p>
      </div>
    );
  }

  return (
    <div className="text-xs">
      <p className="font-medium text-emerald-700 dark:text-emerald-400">Aprovada</p>
      <p className="text-muted-foreground">
        {approvedByName ? `por ${approvedByName}` : "—"}
      </p>
      <p className="text-muted-foreground">{formatApprovedAt(approvedAt)}</p>
    </div>
  );
}
