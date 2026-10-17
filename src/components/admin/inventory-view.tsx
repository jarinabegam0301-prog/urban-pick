"use client";

import Link from "next/link";
import { useState } from "react";
import { useAdminSession } from "@/components/admin/admin-session";
import { PageHeader, Panel } from "@/components/admin/page-header";
import { StockHistory } from "@/components/admin/stock-history";
import { StatusBadge } from "@/components/ui/badge";
import { SearchInput } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useApi } from "@/hooks/use-api";
import { useDebounced } from "@/hooks/use-debounced";
import { cn } from "@/lib/cn";
import { adminApi } from "@/services/admin";
import { SIZES } from "@/types/store";

const PAGE_SIZE = 25;

export function InventoryView() {
  const { expire } = useAdminSession();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(search.trim());
  const params = { q, page, page_size: PAGE_SIZE };
  const inventory = useApi(() => adminApi.inventory(params), JSON.stringify(params), expire);
  const events = useApi(() => adminApi.stockEvents(30), "stock-events", expire);

  return (
    <>
      <PageHeader title="Inventory" description="Available stock per size, lowest first." />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <SearchInput
            aria-label="Search inventory"
            placeholder="Search by product name"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="mb-4"
          />

          {inventory.error && !inventory.data ? (
            <ErrorState message={inventory.error} onRetry={inventory.reload} />
          ) : !inventory.data ? (
            <div className="flex flex-col gap-2" role="status" aria-label="Loading inventory">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          ) : inventory.data.items.length === 0 ? (
            <EmptyState title={q ? "No products match" : "No products yet"} />
          ) : (
            <div className={cn("transition-opacity", inventory.loading && "opacity-60")}>
              <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-surface-muted text-left text-xs tracking-wide text-muted uppercase">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium">Product</th>
                      {SIZES.map((s) => (
                        <th key={s} scope="col" className="px-2 py-3 text-center font-medium">{s}</th>
                      ))}
                      <th scope="col" className="px-4 py-3 text-right font-medium">Available</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Sold</th>
                      <th scope="col" className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {inventory.data.items.map((p) => (
                      <tr key={p.id} className="hover:bg-foreground/[0.02]">
                        <th scope="row" className="px-4 py-3 text-left font-medium">
                          <Link href={`/admin/products/${p.id}`} className="hover:underline">
                            {p.name}
                          </Link>
                        </th>
                        {SIZES.map((size) => {
                          const row = p.sizes.find((s) => s.size === size);
                          const available = row?.available_quantity ?? 0;
                          return (
                            <td
                              key={size}
                              className={cn(
                                "px-2 py-3 text-center tabular-nums",
                                available === 0 ? "text-danger/70" : "",
                              )}
                              title={row ? `${row.sold_quantity} sold of ${row.initial_quantity}` : undefined}
                            >
                              {available === 0 ? "–" : available}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">
                          {p.available_quantity}
                          <span className="font-normal text-muted"> / {p.total_quantity}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-muted tabular-nums">{p.sold_quantity}</td>
                        <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4">
                <Pagination
                  page={inventory.data.page}
                  pages={inventory.data.pages}
                  total={inventory.data.total}
                  label="products"
                  onPageChange={setPage}
                />
              </div>
            </div>
          )}
        </div>

        <Panel
          title="Recent stock changes"
          className="xl:sticky xl:top-24 xl:flex xl:h-[calc(100dvh-9rem)] xl:min-h-0 xl:flex-col"
          bodyClassName="xl:min-h-0 xl:flex-1 xl:overflow-y-auto"
        >
          {events.error && !events.data ? (
            <ErrorState message={events.error} onRetry={events.reload} />
          ) : !events.data ? (
            <div className="flex flex-col gap-3" role="status" aria-label="Loading stock changes">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : (
            <StockHistory events={events.data} showProduct />
          )}
        </Panel>
      </div>
    </>
  );
}
