import Image from "next/image";
import { cn } from "@/lib/cn";
import { isOptimizable, resolveImageUrl } from "@/lib/images";

type Props = {
  src?: string;
  alt: string;
  category?: string;
  sizes: string;
  priority?: boolean;
  className?: string;
};

/** Fills its parent, which must be positioned and have an aspect ratio. */
export function ProductImage({ src, alt, category, sizes, priority, className }: Props) {
  if (!src) {
    return <GarmentPlaceholder category={category} label={alt} className={className} />;
  }
  return (
    <Image
      src={resolveImageUrl(src)}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      unoptimized={!isOptimizable(src)}
      className={cn("bg-surface-muted object-cover", className)}
    />
  );
}

const SHAPES: Record<string, string> = {
  "t-shirts":
    "M38 18 24 26l6 14 8-4v44h44V36l8 4 6-14-14-8H70c-1 6-5 9-10 9s-9-3-10-9H38Z",
  shirts:
    "M40 18 24 28l5 13 9-4v43h44V37l9 4 5-13-16-10H70l-10 12-10-12H40Zm20 12v50",
  pants: "M38 16h44l4 64H66l-6-40-6 40H34l4-64Zm0 8h44",
  hoodies:
    "M44 22c2-8 8-12 16-12s14 4 16 12l14 8 6 18-10 4-6-8v38H40V44l-6 8-10-4 6-18 14-8Zm4 0c2 6 6 10 12 10s10-4 12-10",
  others: "M36 22 24 32l6 14 6-3v37h48V43l6 3 6-14-12-10H70l-10 8-10-8H36Z",
};

function GarmentPlaceholder({
  category,
  label,
  className,
}: {
  category?: string;
  label: string;
  className?: string;
}) {
  const path = SHAPES[category ?? ""] ?? SHAPES.others;
  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "absolute inset-0 flex items-center justify-center bg-surface-muted text-secondary/25 dark:text-primary/20",
        className,
      )}
    >
      <svg viewBox="0 0 120 96" className="h-1/2 w-1/2" fill="none" aria-hidden="true">
        <path d={path} stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
