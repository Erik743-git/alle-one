"use client";

import { FlipCheckbox } from "@/components/ui/flip-checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  BULK_APPROVAL_STATUS_OPTIONS,
  toggleBulkStatusFilter,
  type BulkApprovalStatusFilter,
} from "@/lib/apontamentos/bulk-approval";

type Props = {
  value: BulkApprovalStatusFilter[];
  onChange: (value: BulkApprovalStatusFilter[]) => void;
  disabled?: boolean;
  className?: string;
};

export function BulkApprovalStatusFilterField({
  value,
  onChange,
  disabled = false,
  className,
}: Props) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label className="text-xs font-semibold text-muted-foreground">
        Situação
      </Label>
      <div className="flex flex-wrap gap-3 rounded-lg border border-border px-3 py-2.5">
        {BULK_APPROVAL_STATUS_OPTIONS.map((option) => {
          const checked = value.includes(option.value);
          return (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-center gap-2 text-sm",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <FlipCheckbox
                checked={checked}
                disabled={disabled}
                onChange={(event) => {
                  onChange(
                    toggleBulkStatusFilter(
                      value,
                      option.value,
                      event.target.checked,
                    ),
                  );
                }}
                aria-label={option.label}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Marque mais de uma para ver tipos combinados. Pelo menos uma deve ficar
        selecionada.
      </p>
    </div>
  );
}
