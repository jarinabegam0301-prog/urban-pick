import Link from "next/link";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/cn";

export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  return (
    <header
      className={cn(
        "z-30",
        overlay
          ? "absolute inset-x-0 top-0"
          : "sticky top-0 border-b border-border bg-background/90 backdrop-blur-md",
      )}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-40 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link
          href="/"
          aria-label="URBAN home"
          className="font-display text-[1.7rem] leading-none tracking-[0.22em] text-foreground"
        >
          URBAN
        </Link>
        <nav aria-label="Main" className="flex items-center gap-2 sm:gap-6">
          <Link
            href="/products"
            className={cn(
              "inline-flex h-11 items-center px-2 text-sm tracking-[0.14em] text-foreground uppercase",
              overlay && "hidden sm:inline-flex",
            )}
          >
            Products
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
