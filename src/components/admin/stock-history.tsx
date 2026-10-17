import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { STOCK_EVENT_LABEL } from "@/lib/status";
import type { StockEvent } from "@/types/admin";

export function StockHistory({ events, showProduct = false }: { events: StockEvent[]; showProduct?: boolean }) {
  if (events.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">No stock changes yet.</p>;
  }
  return (
    <ol className="-my-2 divide-y divide-border">
      {events.map((event) => (
        <li key={event.id} className="flex items-start justify-between gap-4 py-3 text-sm">
          <div className="min-w-0">
            <p className="font-medium">
              {STOCK_EVENT_LABEL[event.event_type]}
              {event.size ? <span className="text-muted"> · {event.size}</span> : null}
            </p>
            {showProduct ? (
              <Link href={`/admin/products/${event.product_id}`} className="block truncate text-muted hover:underline">
                {event.product_name}
              </Link>
            ) : null}
            {event.note ? <p className="truncate text-muted">{event.note}</p> : null}
            <p className="text-xs text-muted">{formatDateTime(event.created_at)}</p>
          </div>
          <div className="shrink-0 text-right tabular-nums">
            <p
              className={cn(
                "font-semibold",
                event.quantity_change > 0 ? "text-success" : event.quantity_change < 0 ? "text-danger" : "",
              )}
            >
              {event.quantity_change > 0 ? "+" : ""}
              {event.quantity_change}
            </p>
            <p className="text-xs text-muted">
              {event.quantity_before} → {event.quantity_after}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
