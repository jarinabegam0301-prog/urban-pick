import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function KpiCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "danger" | "success";
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
      <p
        className={cn(
          "mt-2 text-2xl font-semibold tracking-tight tabular-nums sm:text-[28px]",
          tone === "danger" && "text-danger",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
