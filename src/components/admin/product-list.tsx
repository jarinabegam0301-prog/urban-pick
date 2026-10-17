"use client";

import Link from "next/link";
import { useState } from "react";
import { useAdminSession } from "@/components/admin/admin-session";
import { PageHeader } from "@/components/admin/page-header";
import { RecordSaleDialog } from "@/components/admin/record-sale-dialog";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchInput, Select } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { ProductImage } from "@/components/ui/product-image";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useApi } from "@/hooks/use-api";
import { useDebounced } from "@/hooks/use-debounced";
import { cn } from "@/lib/cn";
import { formatNumber, formatPrice } from "@/lib/format";
import { PRODUCT_STATUS_OPTIONS } from "@/lib/status";
import { adminApi } from "@/services/admin";
import type { AdminProduct, ProductStatus } from "@/types/admin";

const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "name_asc", label: "Name A–Z" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "stock_asc", label: "Lowest stock" },
];

const PAGE_SIZE = 20;

export function ProductList() {
  const { expire } = useAdminSession();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<ProductStatus | "">("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [saleFor, setSaleFor] = useState<AdminProduct | null>(null);
  const q = useDebounced(search.trim());

  const categories = useApi(adminApi.categories, "categories", expire);
  const params = { q, category, status, sort, page, page_size: PAGE_SIZE };
  const products = useApi(() => adminApi.products(params), JSON.stringify(params), expire);

  const filtered = Boolean(q || category || status);

  function update<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  function clearFilters() {
    setSearch("");
    setCategory("");
    setStatus("");
    setPage(1);
  }

  return (
    <>
      <PageHeader
        title="Products"
        description={products.data ? `${formatNumber(products.data.total)} products` : "Your catalogue"}
        actions={<Button href="/admin/products/new">Add product</Button>}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_180px_200px_200px]">
        <SearchInput
          aria-label="Search products"
          placeholder="Search by name"
          value={search}
          onChange={(e) => update(setSearch)(e.target.value)}
          className="sm:col-span-2 lg:col-span-1"
        />
        <Select aria-label="Category" value={category} onChange={(e) => update(setCategory)(e.target.value)}>
          <option value="">All categories</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Status"
          value={status}
          onChange={(e) => update(setStatus)(e.target.value as ProductStatus | "")}
        >
          <option value="">All statuses</option>
          {PRODUCT_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select aria-label="Sort" value={sort} onChange={(e) => update(setSort)(e.target.value)}>
          {SORTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>

      {products.error && !products.data ? (
        <ErrorState message={products.error} onRetry={products.reload} />
      ) : !products.data ? (
        <ListSkeleton />
      ) : products.data.items.length === 0 ? (
        filtered ? (
          <EmptyState
            title="No products match"
            description="Try a different search or clear the filters."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No products yet"
            description="Add your first product to start tracking stock and sales."
            action={<Button href="/admin/products/new">Add product</Button>}
          />
        )
      ) : (
        <div className={cn("transition-opacity", products.loading && "opacity-60")} aria-busy={products.loading}>
          <ProductTable items={products.data.items} onSell={setSaleFor} />
          <ProductCards items={products.data.items} onSell={setSaleFor} />
          <div className="mt-4">
            <Pagination
              page={products.data.page}
              pages={products.data.pages}
              total={products.data.total}
              label="products"
              onPageChange={setPage}
            />
          </div>
        </div>
      )}

      {saleFor ? (
        <RecordSaleDialog
          open
          product={saleFor}
          onClose={() => setSaleFor(null)}
          onRecorded={products.reload}
        />
      ) : null}
    </>
  );
}

function ProductTable({ items, onSell }: { items: AdminProduct[]; onSell: (p: AdminProduct) => void }) {
  return (
    <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface md:block">
      <table className="w-full text-sm">
        <thead className="bg-surface-muted text-left text-xs tracking-wide text-muted uppercase">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">Product</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Cost</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Price</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Profit / unit</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Stock</th>
            <th scope="col" className="px-4 py-3 font-medium">Status</th>
            <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((p) => (
            <tr key={p.id} className="hover:bg-foreground/[0.02]">
              <td className="px-4 py-3">
                <Link href={`/admin/products/${p.id}`} className="flex items-center gap-3">
                  <span className="relative size-12 shrink-0 overflow-hidden rounded-lg">
                    <ProductImage src={p.images[0]} alt="" category={p.category.slug} sizes="48px" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium hover:underline">{p.name}</span>
                    <span className="flex items-center gap-2 text-xs text-muted">
                      {p.category.name}
                      {!p.is_published ? <Badge>Hidden</Badge> : null}
                    </span>
                  </span>
                </Link>
              </td>
              <td className="px-4 py-3 text-right text-muted tabular-nums">{formatPrice(p.cost_price)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatPrice(p.selling_price)}</td>
              <td className="px-4 py-3 text-right text-success tabular-nums">{formatPrice(p.profit_per_unit)}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                <span className="font-medium">{p.available_quantity}</span>
                <span className="text-muted"> / {p.total_quantity}</span>
              </td>
              <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    onClick={() => onSell(p)}
                    disabled={p.available_quantity === 0}
                  >
                    Sell
                  </Button>
                  <Button variant="ghost" href={`/admin/products/${p.id}`}>Edit</Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductCards({ items, onSell }: { items: AdminProduct[]; onSell: (p: AdminProduct) => void }) {
  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {items.map((p) => (
        <li key={p.id} className="rounded-2xl border border-border bg-surface p-3">
          <Link href={`/admin/products/${p.id}`} className="flex gap-3">
            <span className="relative size-20 shrink-0 overflow-hidden rounded-xl">
              <ProductImage src={p.images[0]} alt="" category={p.category.slug} sizes="80px" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{p.name}</span>
              <span className="block text-xs text-muted">
                {p.category.name}
                {!p.is_published ? " · Hidden" : ""}
              </span>
              <span className="mt-1.5 block text-sm tabular-nums">
                {formatPrice(p.selling_price)}
                <span className="text-muted"> · cost {formatPrice(p.cost_price)}</span>
              </span>
              <span className="mt-1.5 flex items-center gap-2">
                <StatusBadge status={p.status} />
                <span className="text-xs text-muted tabular-nums">
                  {p.available_quantity}/{p.total_quantity} left
                </span>
              </span>
            </span>
          </Link>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => onSell(p)} disabled={p.available_quantity === 0}>
              Record sale
            </Button>
            <Button variant="secondary" href={`/admin/products/${p.id}`}>
              Edit
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ListSkeleton() {
  return (
    <div role="status" aria-label="Loading products" className="flex flex-col gap-3">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-20 rounded-2xl" />
      ))}
    </div>
  );
}
