import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type DataTableColumn<T> = {
  id: string;
  header: ReactNode;
  headerClassName?: string;
  cellClassName?: string;
  cell: (row: T) => ReactNode;
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  loadingMessage?: string;
  emptyMessage?: string;
  minWidthClassName?: string;
  className?: string;
  rowClassName?: string;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  loadingMessage = "Carregando…",
  emptyMessage = "Nenhum registro encontrado.",
  minWidthClassName = "min-w-full",
  className,
  rowClassName = "border-t border-border/60 align-top",
}: DataTableProps<T>) {
  const colSpan = columns.length;

  return (
    <div
      className={cn(
        "overflow-x-auto rounded-2xl border border-border",
        className,
      )}
    >
      <table className={cn(minWidthClassName, "w-full text-left text-sm")}>
        <thead className="bg-primary/15 text-foreground">
          <tr>
            {columns.map((column) => (
              <th
                key={column.id}
                className={cn("px-4 py-3", column.headerClassName)}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td className="px-4 py-4 text-muted-foreground" colSpan={colSpan}>
                {loadingMessage}
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td className="px-4 py-4 text-muted-foreground" colSpan={colSpan}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} className={rowClassName}>
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className={cn("px-4 py-3", column.cellClassName)}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
