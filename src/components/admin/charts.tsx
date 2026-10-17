import { formatCompactPrice, formatDay, formatNumber, formatPrice } from "@/lib/format";
import type { StockRow } from "@/types/admin";

export function SalesChart({ data }: { data: { date: string; revenue: number; units: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.revenue));
  const total = data.reduce((sum, d) => sum + d.revenue, 0);

  if (total === 0) {
    return <p className="py-12 text-center text-sm text-muted">No sales in the last 30 days.</p>;
  }

  return (
    <figure>
      <div className="flex h-48 items-end gap-[3px]" role="img" aria-label={`Revenue for the last ${data.length} days, ${formatPrice(total)} in total`}>
        {data.map((d) => (
          <div key={d.date} className="group relative flex h-full flex-1 items-end">
            <div
              className="w-full rounded-t-sm bg-secondary/80 transition-colors group-hover:bg-secondary dark:bg-primary/70 dark:group-hover:bg-primary"
              style={{ height: `${Math.max(d.revenue > 0 ? 3 : 0, (d.revenue / max) * 100)}%` }}
            />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-xs whitespace-nowrap text-background group-hover:block">
              {formatDay(d.date)} · {formatPrice(d.revenue)} · {d.units} units
            </div>
          </div>
        ))}
      </div>
      <figcaption className="mt-2 flex justify-between text-xs text-muted">
        <span>{data[0] ? formatDay(data[0].date) : ""}</span>
        <span>Peak {formatCompactPrice(max)}</span>
        <span>{data.at(-1) ? formatDay(data.at(-1)!.date) : ""}</span>
      </figcaption>
    </figure>
  );
}

export function InventoryChart({ rows }: { rows: StockRow[] }) {
  if (rows.length === 0) {
    return <p className="py-12 text-center text-sm text-muted">No products yet.</p>;
  }
  return (
    <div>
      <ul className="flex flex-col gap-3">
        {rows.map((row) => {
          const soldPct = row.total ? (row.sold / row.total) * 100 : 0;
          const availablePct = row.total ? (row.available / row.total) * 100 : 0;
          return (
            <li key={row.product_id}>
              <div className="flex justify-between gap-3 text-sm">
                <span className="truncate">{row.name}</span>
                <span className="shrink-0 text-muted tabular-nums">
                  {formatNumber(row.available)} / {formatNumber(row.total)}
                </span>
              </div>
              <div
                className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-foreground/8"
                role="img"
                aria-label={`${row.name}: ${row.available} available, ${row.sold} sold of ${row.total}`}
              >
                <div className="bg-success" style={{ width: `${availablePct}%` }} />
                <div className="bg-foreground/25" style={{ width: `${soldPct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-success" aria-hidden="true" /> Available
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-foreground/25" aria-hidden="true" /> Sold
        </span>
      </div>
    </div>
  );
}
