import Link from "next/link";
import { ProductImage } from "@/components/ui/product-image";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import type { PublicProduct } from "@/types/store";

export function ProductCard({ product, priority }: { product: PublicProduct; priority?: boolean }) {
  const soldOut = product.status === "sold_out";

  return (
    <Link
      href={`/products/${product.id}`}
      className="group flex w-full flex-col focus-visible:outline-offset-4"
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-surface-muted">
        <ProductImage
          src={product.images[0]}
          alt={product.name}
          category={product.category.slug}
          sizes="(min-width: 1024px) 22vw, (min-width: 640px) 32vw, 48vw"
          priority={priority}
          className={cn(
            "transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none",
            soldOut && "opacity-60",
          )}
        />
        {soldOut ? (
          <span className="absolute top-3 left-3 rounded-full bg-foreground px-2.5 py-1 text-[11px] font-medium tracking-[0.14em] text-background uppercase">
            Sold out
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col pt-3">
        <p className="text-xs tracking-[0.14em] text-muted uppercase">{product.category.name}</p>
        <h3 className="mt-1 text-[15px] leading-snug font-medium text-foreground sm:text-base">
          {product.name}
        </h3>
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-semibold text-foreground">{formatPrice(product.selling_price)}</span>
          {product.original_price && product.original_price > product.selling_price ? (
            <span className="text-muted line-through">
              <span className="sr-only">Was </span>
              {formatPrice(product.original_price)}
            </span>
          ) : null}
        </p>

        <ul className="mt-2.5 flex flex-wrap gap-1" aria-label="Sizes">
          {product.sizes.map((size) => (
            <li
              key={size.size}
              className={cn(
                "min-w-8 rounded-md border px-1.5 py-0.5 text-center text-[11px] font-medium",
                size.available
                  ? "border-border-strong text-foreground"
                  : "border-border text-muted/60 line-through",
              )}
            >
              {size.size}
              {size.available ? null : <span className="sr-only"> sold out</span>}
            </li>
          ))}
        </ul>

        <span className="mt-3 inline-flex h-11 items-center justify-center rounded-lg border border-border-strong text-xs font-medium tracking-[0.16em] text-foreground uppercase transition-colors group-hover:bg-foreground group-hover:text-background">
          {soldOut ? "View details" : "View product"}
        </span>
      </div>
    </Link>
  );
}
