import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { PRODUCT_STATUS, type Tone } from "@/lib/status";
import type { ProductStatus } from "@/types/admin";

const tones: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-foreground/6 text-muted",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: ProductStatus }) {
  const meta = PRODUCT_STATUS[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}
