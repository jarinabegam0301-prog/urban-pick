"use client";

import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { useAdminSession } from "@/components/admin/admin-session";
import { KpiCard } from "@/components/admin/kpi-card";
import { PageHeader, Panel } from "@/components/admin/page-header";
import { ProductForm } from "@/components/admin/product-form";
import { RecordSaleDialog } from "@/components/admin/record-sale-dialog";
import { StockEditor } from "@/components/admin/stock-editor";
import { StockHistory } from "@/components/admin/stock-history";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { useApi } from "@/hooks/use-api";
import { ApiError } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { adminApi } from "@/services/admin";
import type { AdminProduct } from "@/types/admin";

export function ProductEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { expire } = useAdminSession();
  const product = useApi(() => adminApi.product(id), `product-${id}`, expire);
  const categories = useApi(adminApi.categories, "categories", expire);

  if (product.error && !product.data) {
    return product.errorStatus === 404 || product.errorStatus === 422 ? (
      <EmptyState
        title="Product not found"
        description="It may have been deleted."
        action={<Button href="/admin/products">Back to products</Button>}
      />
    ) : (
      <ErrorState message={product.error} onRetry={product.reload} />
    );
  }
  if (!product.data || !categories.data) return <ProductEditorSkeleton />;

  return (
    <LoadedEditor
      product={product.data}
      categories={categories.data}
      onChange={product.setData}
    />
  );
}

function LoadedEditor({
  product,
  categories,
  onChange,
}: {
  product: AdminProduct;
  categories: Parameters<typeof ProductForm>[0]["categories"];
  onChange: (product: AdminProduct) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { expire } = useAdminSession();
  const history = useApi(() => adminApi.productHistory(product.id), `history-${product.id}-${product.updated_at}`, expire);
  const [saleOpen, setSaleOpen] = useState(false);
  const [confirm, setConfirm] = useState<"sold-out" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      onChange(await adminApi.product(product.id));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) expire();
    }
  }

  async function markSoldOut() {
    setBusy(true);
    try {
      onChange(await adminApi.markSoldOut(product.id));
      toast.success(`${product.name} marked sold out.`);
      setConfirm(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't mark the product sold out.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await adminApi.deleteProduct(product.id);
      toast.success(`${product.name} deleted.`);
      router.replace("/admin/products");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete the product.");
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={product.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {product.category.name}
            <StatusBadge status={product.status} />
            {!product.is_published ? <Badge>Hidden from store</Badge> : null}
          </span>
        }
        actions={
          <>
            <Button onClick={() => setSaleOpen(true)} disabled={product.available_quantity === 0}>
              Record sale
            </Button>
            {product.is_published ? (
              <Button variant="secondary" href={`/products/${product.id}`}>
                View in store
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Available" value={product.available_quantity} hint={`of ${product.total_quantity}`} />
        <KpiCard label="Sold" value={product.sold_quantity} />
        <KpiCard label="Profit / unit" value={formatPrice(product.profit_per_unit)} tone="success" />
        <KpiCard
          label="Estimated profit"
          value={formatPrice(product.estimated_profit)}
          hint="if remaining stock sells"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          <StockEditor product={product} onChange={onChange} />
          <ProductForm
            key={product.id}
            product={product}
            categories={categories}
            submitLabel="Save changes"
            onSubmit={async (values) => {
              const { sizes: _ignored, ...fields } = values;
              void _ignored;
              onChange(await adminApi.updateProduct(product.id, fields));
              toast.success("Product saved.");
            }}
          />
        </div>

        <div className="flex flex-col gap-6">
          <Panel title="Stock history">
            {history.error && !history.data ? (
              <ErrorState message={history.error} onRetry={history.reload} />
            ) : !history.data ? (
              <div className="flex flex-col gap-3" role="status" aria-label="Loading history">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : (
              <StockHistory events={history.data} />
            )}
          </Panel>

          <Panel title="Danger zone">
            <div className="flex flex-col gap-3">
              <div>
                <Button
                  variant="secondary"
                  className="w-full"
                  disabled={product.available_quantity === 0}
                  onClick={() => setConfirm("sold-out")}
                >
                  Mark whole product sold out
                </Button>
                <p className="mt-1.5 text-xs text-muted">Sets every size to zero available.</p>
              </div>
              <div>
                <Button variant="destructive" className="w-full" onClick={() => setConfirm("delete")}>
                  Delete product
                </Button>
                <p className="mt-1.5 text-xs text-muted">
                  Removes it from the store and admin lists. Sales history is kept.
                </p>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <RecordSaleDialog
        open={saleOpen}
        product={product}
        onClose={() => setSaleOpen(false)}
        onRecorded={refresh}
      />
      <ConfirmDialog
        open={confirm === "sold-out"}
        onClose={() => setConfirm(null)}
        onConfirm={markSoldOut}
        loading={busy}
        destructive
        title="Mark product sold out?"
        description={`All ${product.available_quantity} remaining pieces of ${product.name} will be removed from stock. Customers will see it as sold out.`}
        confirmLabel="Mark sold out"
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onClose={() => setConfirm(null)}
        onConfirm={remove}
        loading={busy}
        destructive
        title="Delete product?"
        description={`${product.name} will be removed from the store and admin lists. This can't be undone from the portal.`}
        confirmLabel="Delete"
      />
    </>
  );
}

export function ProductEditorSkeleton() {
  return (
    <div role="status" aria-label="Loading product">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="mt-2 h-5 w-40" />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    </div>
  );
}
