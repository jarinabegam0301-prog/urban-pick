import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";

type Props = {
  page: number;
  pages: number;
  total: number;
  /** Either links (server pages) or a callback (client pages). */
  hrefFor?: (page: number) => string;
  onPageChange?: (page: number) => void;
  label?: string;
};

export function Pagination({ page, pages, total, hrefFor, onPageChange, label = "results" }: Props) {
  if (pages <= 1) return null;

  const control = (target: number, text: string, disabled: boolean) => {
    const className = buttonClasses("secondary", "md", disabled ? "pointer-events-none opacity-40" : "");
    if (hrefFor) {
      return disabled ? (
        <span className={className} aria-disabled="true">
          {text}
        </span>
      ) : (
        <Link href={hrefFor(target)} className={className} scroll>
          {text}
        </Link>
      );
    }
    return (
      <button
        type="button"
        className={className}
        disabled={disabled}
        onClick={() => onPageChange?.(target)}
      >
        {text}
      </button>
    );
  };

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 pt-2">
      <p className="text-sm text-muted">
        Page {page} of {pages} · {total} {label}
      </p>
      <div className="flex gap-2">
        {control(page - 1, "Previous", page <= 1)}
        {control(page + 1, "Next", page >= pages)}
      </div>
    </nav>
  );
}
