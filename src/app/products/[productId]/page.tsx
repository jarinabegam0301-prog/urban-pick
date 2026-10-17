import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProductGallery } from "@/components/public/product-gallery";
import { PurchasePanel } from "@/components/public/purchase-panel";
import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import { StoreError } from "@/components/public/store-error";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { getProduct, getStoreConfig } from "@/services/store";

export default function ProductPage({ params }: PageProps<"/products/[productId]">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-32 sm:px-8 lg:pb-20">
        <Link
          href="/products"
          className="inline-flex h-11 items-center gap-2 text-sm text-muted hover:text-foreground"
        >
          <span aria-hidden="true">←</span> All products
        </Link>
        <Suspense fallback={<ProductDetailSkeleton />}>
          <ProductDetail params={params} />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}

async function ProductDetail({
  params,
}: {
  params: PageProps<"/products/[productId]">["params"];
}) {
  const { productId } = await params;

  let data;
  try {
    const [product, config] = await Promise.all([getProduct(productId), getStoreConfig()]);
    data = { product, config };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return (
      <StoreError
        message={error instanceof ApiError ? error.message : "We couldn't load this product."}
      />
    );
  }

  const { product, config } = data;
  const soldOut = product.status === "sold_out";
  const discount =
    product.original_price && product.original_price > product.selling_price
      ? Math.round((1 - product.selling_price / product.original_price) * 100)
      : null;

  return (
    <div className="mt-4 grid gap-8 lg:grid-cols-2 lg:gap-14">
      <ProductGallery
        images={product.images}
        name={product.name}
        category={product.category.slug}
        soldOut={soldOut}
      />

      <div className="flex flex-col gap-8 lg:sticky lg:top-24 lg:self-start">
        <div>
          <p className="text-xs tracking-[0.2em] text-muted uppercase">{product.category.name}</p>
          <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">{product.name}</h1>
          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-2xl font-semibold">{formatPrice(product.selling_price)}</p>
            {discount ? (
              <>
                <p className="text-lg text-muted line-through">
                  <span className="sr-only">Original price </span>
                  {formatPrice(product.original_price!)}
                </p>
                <p className="text-sm font-medium text-success">{discount}% off</p>
              </>
            ) : null}
          </div>
          <p className="mt-3 text-sm">
            {soldOut ? (
              <span className="font-medium text-danger">Sold out — every size is gone.</span>
            ) : (
              <span className="text-success">In stock</span>
            )}
          </p>
        </div>

        <PurchasePanel product={product} whatsappNumber={config.whatsapp_number} />

        {product.description ? (
          <section className="border-t border-border pt-6">
            <h2 className="text-sm font-medium tracking-[0.14em] uppercase">Details</h2>
            <p className="mt-3 leading-relaxed whitespace-pre-line text-muted">
              {product.description}
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function ProductDetailSkeleton() {
  return (
    <div className="mt-4 grid gap-8 lg:grid-cols-2 lg:gap-14" role="status" aria-label="Loading product">
      <Skeleton className="aspect-[4/5] rounded-2xl" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-7 w-32" />
        <div className="mt-6 grid grid-cols-5 gap-2">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-13 rounded-lg" />
          ))}
        </div>
        <Skeleton className="mt-4 h-13" />
      </div>
    </div>
  );
}
