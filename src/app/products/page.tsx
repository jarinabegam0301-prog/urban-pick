import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogHeading, CatalogSkeleton } from "@/components/public/catalog-skeleton";
import {
  CatalogProvider,
  CatalogResults,
  CatalogToolbar,
  FilterSidebar,
} from "@/components/public/catalog-controls";
import { ProductCard } from "@/components/public/product-card";
import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import { StoreError } from "@/components/public/store-error";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { Pagination } from "@/components/ui/pagination";
import { ApiError } from "@/lib/api";
import { activeFilterCount, filtersToHref, parseFilters } from "@/lib/filters";
import { getCategories, getProducts } from "@/services/store";

export const metadata: Metadata = {
  title: "Shop · URBAN",
  description: "Shop URBAN t-shirts, shirts, pants and hoodies.",
};

export default function ProductsPage({ searchParams }: PageProps<"/products">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pt-8 pb-20 sm:px-8 sm:pt-12">
        <Suspense fallback={<CatalogSkeleton />}>
          <Catalog searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}

async function Catalog({ searchParams }: { searchParams: PageProps<"/products">["searchParams"] }) {
  const filters = parseFilters(await searchParams);

  let data;
  try {
    const [products, categories] = await Promise.all([getProducts(filters), getCategories()]);
    data = { products, categories };
  } catch (error) {
    return (
      <>
        <CatalogHeading />
        <StoreError
          message={error instanceof ApiError ? error.message : "We couldn't load products."}
        />
      </>
    );
  }

  const { products, categories } = data;
  const filtered = activeFilterCount(filters) > 0 || Boolean(filters.q);

  return (
    <CatalogProvider filters={filters} categories={categories}>
      <CatalogHeading total={products.total} />
      <CatalogToolbar />
      <div className="mt-8 lg:grid lg:grid-cols-[230px_1fr] lg:gap-10">
        <aside className="hidden lg:block" aria-label="Filters">
          <FilterSidebar />
        </aside>
        <CatalogResults>
          {products.items.length === 0 ? (
            filtered ? (
              <EmptyState
                title="No products match these filters"
                description="Try a different size, price range or category."
                action={
                  <Button variant="secondary" href="/products">
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title="No products available"
                description="Products created from the admin portal will appear here."
              />
            )
          ) : (
            <div className="flex flex-col gap-10">
              <ul className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4">
                {products.items.map((product, index) => (
                  <li key={product.id} className="flex">
                    <ProductCard product={product} priority={index < 4} />
                  </li>
                ))}
              </ul>
              <Pagination
                page={products.page}
                pages={products.pages}
                total={products.total}
                label="products"
                hrefFor={(page) => filtersToHref({ ...filters, page: String(page) })}
              />
            </div>
          )}
        </CatalogResults>
      </div>
    </CatalogProvider>
  );
}
