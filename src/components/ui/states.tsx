"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-2xl border border-dashed border-border-strong px-6 py-14 text-center",
        className,
      )}
    >
      <p className="text-base font-medium text-foreground">{title}</p>
      {description ? <p className="mt-2 max-w-sm text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message?: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center rounded-2xl border border-border bg-danger-soft/40 px-6 py-14 text-center",
        className,
      )}
    >
      <p className="text-base font-medium text-foreground">Something went wrong.</p>
      {message ? <p className="mt-2 max-w-sm text-sm text-muted">{message}</p> : null}
      <Button variant="secondary" className="mt-6" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
