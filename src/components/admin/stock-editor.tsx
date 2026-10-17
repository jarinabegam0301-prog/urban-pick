"use client";

import { useState } from "react";
import { Panel } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { adminApi } from "@/services/admin";
import type { AdminProduct } from "@/types/admin";
import type { Size } from "@/types/store";

function initialDraft(product: AdminProduct): Record<Size, string> {
  return Object.fromEntries(product.sizes.map((s) => [s.size, String(s.initial_quantity)])) as Record<Size, string>;
}

export function StockEditor({
  product,
  onChange,
}: {
  product: AdminProduct;
  onChange: (product: AdminProduct) => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState(() => initialDraft(product));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [soldOutSize, setSoldOutSize] = useState<Size | null>(null);
  const [markingSize, setMarkingSize] = useState(false);
  const [syncedAt, setSyncedAt] = useState(product.updated_at);

  if (syncedAt !== product.updated_at) {
    setSyncedAt(product.updated_at);
    setDraft(initialDraft(product));
  }

  const rows = product.sizes.map((s) => {
    const text = draft[s.size] ?? "";
    const value = Number(text);
    const valid = text.trim() !== "" && Number.isInteger(value) && value >= 0;
    const belowSold = valid && value < s.sold_quantity;
    return { ...s, text, value, valid, belowSold, changed: valid && value !== s.initial_quantity };
  });
  const dirty = rows.some((r) => r.changed);
  const invalid = rows.some((r) => !r.valid || r.belowSold);
  const draftTotal = rows.reduce((sum, r) => sum + (r.valid ? r.value - r.sold_quantity : 0), 0);

  async function save() {
    setError(null);
    if (invalid) {
      setError("Each size needs a whole number that is not below what has already sold.");
      return;
    }
    setSaving(true);
    try {
      const updated = await adminApi.updateStock(
        product.id,
        rows.filter((r) => r.changed).map((r) => ({ size: r.size, initial_quantity: r.value })),
        note.trim(),
      );
      setNote("");
      onChange(updated);
      toast.success("Stock updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update stock.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmSizeSoldOut() {
    if (!soldOutSize) return;
    setMarkingSize(true);
    try {
      const updated = await adminApi.markSizeSoldOut(product.id, soldOutSize);
      onChange(updated);
      toast.success(`Size ${soldOutSize} marked sold out.`);
      setSoldOutSize(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't mark the size sold out.");
    } finally {
      setMarkingSize(false);
    }
  }

  return (
    <Panel
      title="Stock by size"
      description="Initial is everything you've stocked. Available is initial minus sold."
    >
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="text-left text-xs tracking-wide text-muted uppercase">
            <tr>
              <th scope="col" className="pb-2 font-medium">Size</th>
              <th scope="col" className="pb-2 font-medium">Initial</th>
              <th scope="col" className="pb-2 text-right font-medium">Sold</th>
              <th scope="col" className="pb-2 text-right font-medium">Available</th>
              <th scope="col" className="pb-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.size}>
                <th scope="row" className="py-2 pr-3 font-semibold">{r.size}</th>
                <td className="py-2 pr-3">
                  <Input
                    aria-label={`Initial quantity for size ${r.size}`}
                    type="number"
                    inputMode="numeric"
                    min={r.sold_quantity}
                    step={1}
                    value={r.text}
                    onChange={(e) => setDraft((d) => ({ ...d, [r.size]: e.target.value }))}
                    aria-invalid={!r.valid || r.belowSold || undefined}
                    className="w-24 text-center tabular-nums"
                  />
                </td>
                <td className="py-2 pr-3 text-right text-muted tabular-nums">{r.sold_quantity}</td>
                <td
                  className={cn(
                    "py-2 pr-3 text-right font-medium tabular-nums",
                    r.available_quantity === 0 && "text-danger",
                  )}
                >
                  {r.available_quantity === 0 ? "Sold out" : r.available_quantity}
                </td>
                <td className="py-2 text-right">
                  <Button
                    variant="ghost"
                    className="text-danger"
                    disabled={r.available_quantity === 0}
                    onClick={() => setSoldOutSize(r.size)}
                  >
                    Mark sold out
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-border-strong">
            <tr>
              <th scope="row" className="pt-3 text-left">Total</th>
              <td className="pt-3 tabular-nums">{product.total_quantity}</td>
              <td className="pt-3 text-right text-muted tabular-nums">{product.sold_quantity}</td>
              <td className="pt-3 text-right font-semibold tabular-nums">{product.available_quantity}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {rows.some((r) => r.belowSold) ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          Initial can&apos;t be lower than what has already sold.
        </p>
      ) : null}

      {dirty ? (
        <div className="mt-5 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-end">
          <Field label="Note (optional)" htmlFor="stock-note" className="flex-1">
            <Input
              id="stock-note"
              placeholder="e.g. New shipment"
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setDraft(initialDraft(product))} disabled={saving}>
              Reset
            </Button>
            <Button onClick={save} loading={saving} disabled={invalid}>
              Save stock
            </Button>
          </div>
        </div>
      ) : null}
      {dirty && !invalid ? (
        <p className="mt-2 text-sm text-muted">Available after saving: {draftTotal}</p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <ConfirmDialog
        open={soldOutSize !== null}
        onClose={() => setSoldOutSize(null)}
        onConfirm={confirmSizeSoldOut}
        loading={markingSize}
        destructive
        title={`Mark size ${soldOutSize ?? ""} sold out?`}
        description="Its remaining stock is removed and customers can no longer pick this size. Other sizes are not affected."
        confirmLabel="Mark sold out"
      />
    </Panel>
  );
}
