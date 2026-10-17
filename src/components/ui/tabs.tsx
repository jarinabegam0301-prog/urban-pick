"use client";

import { cn } from "@/lib/cn";

export function SegmentedTabs<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex max-w-full overflow-x-auto rounded-lg border border-border bg-surface-muted p-1",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-9 min-w-11 shrink-0 rounded-md px-3 text-sm font-medium transition-colors",
              active ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
