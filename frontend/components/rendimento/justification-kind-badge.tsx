import { cn } from "@/lib/utils";

type Props = {
  kind: "ALERT" | "VOLUNTARY";
  label?: string;
  className?: string;
};

export function JustificationKindBadge({ kind, label, className }: Props) {
  const text =
    label ?? (kind === "VOLUNTARY" ? "Voluntária" : "Alerta");

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        kind === "VOLUNTARY"
          ? "bg-violet-500/10 text-violet-700 ring-violet-500/30 dark:text-violet-300"
          : "bg-orange-500/10 text-orange-800 ring-orange-500/35 dark:text-orange-300",
        className,
      )}
    >
      {text}
    </span>
  );
}
