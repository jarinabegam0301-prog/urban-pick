"use client";

import Link from "next/link";
import { useState } from "react";
import { useAdminSession } from "@/components/admin/admin-session";
import { KpiCard } from "@/components/admin/kpi-card";
import { PageHeader } from "@/components/admin/page-header";
import { RecordSaleDialog } from "@/components/admin/record-sale-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { SegmentedTabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { useApi } from "@/hooks/use-api";
import { cn } from "@/lib/cn";
import { formatDateTime, formatNumber, formatPrice } from "@/lib/format";
import { adminApi } from "@/services/admin";
import type { Sale, SalesPeriod } from "@/types/admin";

const PERIODS: { value: SalesPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "all", label: "All time" },
];

export function SalesView() {
  const { expire } = useAdminSession();
  const toast = useToast();
  const [period, setPeriod] = useState<SalesPeriod>("month");
  const [page, setPage] = useState(1);
  const [saleOpen, setSaleOpen] = useState(false);
  const [cancelling, setCancelling] = useState<Sale | null>(null);
  const [busy, setBusy] = useState(false);
  const sales = useApi(() => adminApi.sales(period, page), `${period}-${page}`, expire);

  async function cancelSale() {
    if (!cancelling) return;
    setBusy(true);
    try {
      await adminApi.cancelSale(cancelling.id);
      toast.success("Sale cancelled and stock restored.");
      setCancelling(null);
      sales.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't cancel the sale.");
    } finally {
      setBusy(false);
    }
  }

  const summary = sales.data?.summary;

  return (
    <>
      <PageHeader
        title="Sales"
        description="Confirmed sales reduce stock. Cancelling a sale puts the stock back."
        actions={<Button onClick={() => setSaleOpen(true)}>Record sale</Button>}
      />

      <SegmentedTabs
        label="Sales period"
        value={period}
        options={PERIODS}
        onChange={(value) => {
          setPeriod(value);
          setPage(1);
        }}
        className="mb-4"
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary ? (
          <>
            <KpiCard label="Revenue" value={formatPrice(summary.revenue)} />
            <KpiCard label="Profit" value={formatPrice(summary.profit)} tone="success" />
            <KpiCard label="Orders" value={formatNumber(summary.orders)} />
            <KpiCard label="Units sold" value={formatNumber(summary.units)} />
          </>
        ) : (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)
        )}
      </div>

      {sales.error && !sales.data ? (
        <ErrorState message={sales.error} onRetry={sales.reload} />
      ) : !sales.data ? (
        <div className="flex flex-col gap-2" role="status" aria-label="Loading sales">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : sales.data.items.length === 0 ? (
        <EmptyState
          title="No sales in this period"
          description="Record a sale when a WhatsApp order is confirmed."
          action={<Button onClick={() => setSaleOpen(true)}>Record sale</Button>}
        />
      ) : (
        <div className={cn("transition-opacity", sales.loading && "opacity-60")}>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {sales.data.items.map((sale) => {
              const cancelled = sale.status === "cancelled";
              return (
                <li key={sale.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className={cn("font-medium", cancelled && "text-muted line-through")}>
                      <Link href={`/admin/products/${sale.product_id}`} className="hover:underline">
                        {sale.product_name}
                      </Link>
                      <span className="text-muted"> · {sale.size} × {sale.quantity}</span>
                    </p>
                    <p className="text-sm text-muted">
                      {formatDateTime(sale.created_at)}
                      {sale.customer_name ? ` · ${sale.customer_name}` : ""}
                      {sale.customer_phone ? ` · ${sale.customer_phone}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <div className="text-right tabular-nums">
                      <p className={cn("font-semibold", cancelled && "text-muted line-through")}>
                        {formatPrice(sale.revenue)}
                      </p>
                      <p className="text-xs text-success">+{formatPrice(sale.profit)} profit</p>
                    </div>
                    {cancelled ? (
                      <Badge tone="danger">Cancelled</Badge>
                    ) : (
                      <Button variant="ghost" onClick={() => setCancelling(sale)}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-4">
            <Pagination
              page={sales.data.page}
              pages={sales.data.pages}
              total={sales.data.total}
              label="sales"
              onPageChange={setPage}
            />
          </div>
        </div>
      )}

      <RecordSaleDialog open={saleOpen} onClose={() => setSaleOpen(false)} onRecorded={sales.reload} />
      <ConfirmDialog
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        onConfirm={cancelSale}
        loading={busy}
        destructive
        title="Cancel this sale?"
        description={
          cancelling
            ? `${cancelling.quantity} × ${cancelling.product_name} (${cancelling.size}) goes back into stock.`
            : ""
        }
        confirmLabel="Cancel sale"
      />
    </>
  );
}
