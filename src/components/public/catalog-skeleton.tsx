import { Skeleton } from "@/components/ui/skeleton";

export function CatalogHeading({ total }: { total?: number }) {
  return (
    <div className="mb-8">
      <p className="text-xs tracking-[0.32em] text-muted uppercase">Shop</p>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="font-display text-4xl tracking-wide sm:text-5xl">All products</h1>
        {total !== undefined ? (
          <p className="text-sm text-muted" aria-live="polite">
            {total} {total === 1 ? "product" : "products"}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <div key={index}>
          <Skeleton className="aspect-[4/5] rounded-xl" />
          <Skeleton className="mt-3 h-3 w-16" />
          <Skeleton className="mt-2 h-4 w-3/4" />
          <Skeleton className="mt-2 h-4 w-1/3" />
          <Skeleton className="mt-3 h-11 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export function CatalogSkeleton() {
  return (
    <div aria-label="Loading products" role="status">
      <div className="mb-8">
        <Skeleton className="h-3 w-12" />
        <div className="mt-2 flex items-baseline gap-3">
          <Skeleton className="h-12 w-56 sm:h-14" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
      <div className="grid grid-cols-2 items-center gap-x-2 gap-y-3 md:flex md:gap-3">
        <Skeleton className="col-span-2 h-11 w-full rounded-lg md:flex-1" />
        <div className="col-span-2 grid grid-cols-2 items-center gap-2 md:flex md:shrink-0">
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      </div>
      <div className="mt-8 lg:grid lg:grid-cols-[230px_1fr] lg:gap-10">
        <div className="hidden lg:block">
          <Skeleton className="h-80 rounded-xl" />
        </div>
        <ProductGridSkeleton />
      </div>
    </div>
  );
}
