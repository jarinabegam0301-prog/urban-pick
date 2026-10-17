import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

const variants = {
  primary:
    "bg-secondary text-primary hover:bg-[#3d2200] dark:bg-primary dark:text-secondary dark:hover:bg-[#efe6d8] disabled:hover:bg-secondary dark:disabled:hover:bg-primary",
  secondary:
    "border border-border-strong bg-transparent text-foreground hover:bg-foreground/5 disabled:hover:bg-transparent",
  destructive: "bg-danger text-white hover:opacity-90 dark:text-[#1c140c]",
  ghost: "text-foreground hover:bg-foreground/5",
} as const;

const sizes = {
  md: "h-11 min-w-11 rounded-lg px-4 text-sm font-medium",
  lg: "h-13 min-w-11 px-7 text-sm font-medium uppercase tracking-[0.18em]",
} as const;

export type ButtonVariant = keyof typeof variants;

type ButtonProps = {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: keyof typeof sizes;
  className?: string;
  href?: string;
  loading?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: keyof typeof sizes = "md",
  className?: string,
) {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-45",
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  href,
  loading = false,
  type,
  disabled,
  ...rest
}: ButtonProps) {
  const classes = buttonClasses(variant, size, className);

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type={type ?? "button"}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
