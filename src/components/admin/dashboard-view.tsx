"use client";

import Link from "next/link";
import { useState } from "react";
import { useAdminSession } from "@/components/admin/admin-session";
import { InventoryChart, SalesChart } from "@/components/admin/charts";
import { KpiCard } from "@/components/admin/kpi-card";
import { PageHeader, Panel } from "@/components/admin/page-header";
import { RecordSaleDialog } from "@/components/admin/record-sale-dialog";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { SegmentedTabs } from "@/components/ui/tabs";
import { useApi } from "@/hooks/use-api";
import { formatNumber, formatPrice } from "@/lib/format";
import { adminApi } from "@/services/admin";
import type { SalesPeriod } from "@/types/admin";

type Period = Exclude<SalesPeriod, "all">;

const PERIODS: { value: Period; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
];

export function DashboardView() {
  const { expire } = useAdminSession();
  const { data, error, loading, reload } = useApi(adminApi.dashboard, "dashboard", expire);
  const [period, setPeriod] = useState<Period>("today");
  const [saleOpen, setSaleOpen] = useState(false);

  const header = (
    <PageHeader
      title="Dashboard"
      description="Stock, sales and profit at a glance."
      actions={
        <>
          <Button variant="secondary" href="/admin/products/new">
            Add product
          </Button>
          <Button onClick={() => setSaleOpen(true)}>Record sale</Button>
        </>
      }
    />
  );

  const dialog = (
    <RecordSaleDialog open={saleOpen} onClose={() => setSaleOpen(false)} onRecorded={reload} />
  );

  if (error && !data) {
    return (
      <>
        {header}
        <ErrorState message={error} onRetry={reload} />
        {dialog}
      </>
    );
  }

  if (loading && !data) {
    return (
      <>
        {header}
        <DashboardSkeleton />
        {dialog}
      </>
    );
  }

  if (!data) return null;

  const { kpis } = data;
  const summary = data.sales_overview[period];

  return (
    <>
      {header}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Products"
          value={formatNumber(kpis.total_products)}
          hint={`${kpis.available_products} available · ${kpis.sold_out_products} sold out`}
        />
        <KpiCard
          label="Remaining stock"
          value={formatNumber(kpis.remaining_stock)}
          hint={`of ${formatNumber(kpis.total_stock)} units added`}
        />
        <KpiCard label="Units sold" value={formatNumber(kpis.sold_units)} />
        <KpiCard
          label="Sold out"
          value={formatNumber(kpis.sold_out_products)}
          tone={kpis.sold_out_products > 0 ? "danger" : "default"}
          hint="products"
        />
        <KpiCard
          label="Inventory value"
          value={formatPrice(kpis.inventory_value)}
          hint="remaining stock at cost"
        />
        <KpiCard
          label="Retail value"
          value={formatPrice(kpis.inventory_retail_value)}
          hint="remaining stock at selling price"
        />
        <KpiCard
          label="Estimated profit"
          value={formatPrice(kpis.estimated_profit)}
          tone="success"
          hint="if remaining stock sells"
        />
        <KpiCard
          label="Low stock"
          value={formatNumber(data.low_stock.length)}
          tone={data.low_stock.length > 0 ? "danger" : "default"}
          hint={`below ${data.low_stock_threshold} units`}
        />
      </div>

      <Panel
        className="mt-6"
        title="Sales"
        actions={
          <SegmentedTabs label="Sales period" value={period} options={PERIODS} onChange={setPeriod} />
        }
      >
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Revenue" value={formatPrice(summary.revenue)} />
          <Stat label="Profit" value={formatPrice(summary.profit)} />
          <Stat label="Orders" value={formatNumber(summary.orders)} />
          <Stat label="Units" value={formatNumber(summary.units)} />
        </dl>
        <div className="mt-6 border-t border-border pt-5">
          <p className="mb-3 text-sm font-medium">Revenue, last 30 days</p>
          <SalesChart data={data.sales_chart} />
        </div>
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel
          title="Inventory overview"
          description="Products with the least stock left"
          actions={
            <Link href="/admin/inventory" className="text-sm text-muted underline-offset-4 hover:underline">
              View all
            </Link>
          }
        >
          <InventoryChart rows={data.inventory} />
        </Panel>

        <Panel title="Low stock" description={`Fewer than ${data.low_stock_threshold} units left`}>
          {data.low_stock.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Nothing is running low.</p>
          ) : (
            <ul className="-my-2 divide-y divide-border">
              {data.low_stock.map((row) => (
                <li key={row.product_id}>
                  <Link
                    href={`/admin/products/${row.product_id}`}
                    className="flex min-h-11 items-center justify-between gap-3 py-2.5 hover:opacity-80"
                  >
                    <span className="truncate text-sm">{row.name}</span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="text-sm tabular-nums">{row.available} left</span>
                      <StatusBadge status={row.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel className="mt-6" title="Top sellers" description="All time, by units sold">
        {data.top_products.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No sales recorded yet.</p>
        ) : (
          <ol className="-my-2 divide-y divide-border">
            {data.top_products.map((p, index) => (
              <li key={p.product_id} className="flex min-h-11 items-center gap-3 py-2.5 text-sm">
                <span className="w-5 text-muted tabular-nums">{index + 1}</span>
                <Link href={`/admin/products/${p.product_id}`} className="flex-1 truncate hover:underline">
                  {p.name}
                </Link>
                <span className="text-muted tabular-nums">{formatNumber(p.units)} sold</span>
                <span className="w-24 text-right font-medium tabular-nums">{formatPrice(p.revenue)}</span>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      {dialog}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="mt-6 h-80 rounded-2xl" />
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}
