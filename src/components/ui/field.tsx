import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-lg border border-border-strong bg-surface px-3.5 text-[15px] text-foreground placeholder:text-muted/70 transition-colors focus:border-foreground focus:outline-none disabled:opacity-60 aria-[invalid=true]:border-danger";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "min-h-28 py-3", className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(control, "h-11 appearance-none pr-10", className)} {...props}>
        {children}
      </select>
      <svg
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
      >
        <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function SearchInput({
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <div className={cn("relative", className)}>
      <svg
        className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="m13.5 13.5 3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input type="search" className={cn(control, "h-11 pl-10")} {...props} />
    </div>
  );
}
