"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { adminApi } from "@/services/admin";
import type { AdminProduct, Sale } from "@/types/admin";
import type { Size } from "@/types/store";

/**
 * Records a confirmed sale. Pass `product` to lock the product, or leave it
 * out to let the admin pick one.
 */
export function RecordSaleDialog({
  open,
  onClose,
  product: fixedProduct,
  onRecorded,
}: {
  open: boolean;
  onClose: () => void;
  product?: AdminProduct;
  onRecorded: (sale: Sale) => void;
}) {
  const toast = useToast();
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [productId, setProductId] = useState(fixedProduct?.id ?? "");
  const [size, setSize] = useState<Size | "">("");
  const [quantity, setQuantity] = useState("1");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || fixedProduct) return;
    let active = true;
    adminApi
      .products({ sort: "name_asc", page_size: 100 })
      .then((page) => {
        if (active) setProducts(page.items.filter((p) => p.available_quantity > 0));
      })
      .catch(() => {
        if (active) setError("Couldn't load products. Close and try again.");
      });
    return () => {
      active = false;
    };
  }, [open, fixedProduct]);

  const product = fixedProduct ?? products.find((p) => p.id === productId);
  const sizeRow = product?.sizes.find((s) => s.size === size);
  const available = sizeRow?.available_quantity ?? 0;
  const requested = Number.parseInt(quantity, 10) || 0;
  const remaining = available - requested;
  const overselling = Boolean(sizeRow) && requested > available;

  function reset() {
    setProductId(fixedProduct?.id ?? "");
    setSize("");
    setQuantity("1");
    setCustomerName("");
    setCustomerPhone("");
    setError(null);
    setSaving(false);
  }

  function close() {
    reset();
    onClose();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!product) return setError("Choose a product.");
    if (!size) return setError("Choose a size.");
    if (requested < 1) return setError("Quantity must be at least 1.");
    if (overselling) return setError(`Only ${available} left in size ${size}.`);

    setSaving(true);
    try {
      const sale = await adminApi.recordSale({
        product_id: product.id,
        size,
        quantity: requested,
        customer_name: customerName.trim() || undefined,
        customer_phone: customerPhone.trim() || undefined,
      });
      toast.success(`Sale recorded: ${sale.quantity} × ${sale.product_name} (${sale.size})`);
      onRecorded(sale);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't record the sale.");
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Record sale"
      description="Stock is reduced as soon as the sale is saved."
      variant="sheet"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="record-sale-form" loading={saving} disabled={overselling || !size}>
            Record sale
          </Button>
        </>
      }
    >
      <form id="record-sale-form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {fixedProduct ? (
          <p className="text-sm">
            <span className="font-medium">{fixedProduct.name}</span>
            <span className="text-muted"> · {formatPrice(fixedProduct.selling_price)}</span>
          </p>
        ) : (
          <Field label="Product" htmlFor="sale-product">
            <Select
              id="sale-product"
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setSize("");
              }}
            >
              <option value="">Choose a product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.available_quantity} left
                </option>
              ))}
            </Select>
          </Field>
        )}

        {product ? (
          <fieldset>
            <legend className="text-sm font-medium">Size</legend>
            <div className="mt-2 grid grid-cols-5 gap-2">
              {product.sizes.map((s) => {
                const soldOut = s.available_quantity === 0;
                return (
                  <label
                    key={s.size}
                    className={cn(
                      "flex h-14 cursor-pointer flex-col items-center justify-center rounded-lg border text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-foreground",
                      size === s.size
                        ? "border-foreground bg-foreground text-background"
                        : "border-border-strong",
                      soldOut && "cursor-not-allowed opacity-40",
                    )}
                  >
                    <input
                      type="radio"
                      name="sale-size"
                      value={s.size}
                      checked={size === s.size}
                      disabled={soldOut}
                      onChange={() => setSize(s.size)}
                      className="sr-only"
                    />
                    <span className="font-medium">{s.size}</span>
                    <span className="text-[11px] opacity-75">{soldOut ? "Sold out" : `${s.available_quantity} left`}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        <Field label="Quantity" htmlFor="sale-quantity">
          <Input
            id="sale-quantity"
            type="number"
            inputMode="numeric"
            min={1}
            max={available || undefined}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            aria-invalid={overselling || undefined}
          />
        </Field>

        {sizeRow ? (
          <dl className="grid grid-cols-3 gap-2 rounded-xl bg-surface-muted p-3 text-center">
            <div>
              <dt className="text-xs text-muted">Available</dt>
              <dd className="text-lg font-semibold tabular-nums">{available}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Requested</dt>
              <dd className="text-lg font-semibold tabular-nums">{requested}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Remaining</dt>
              <dd className={cn("text-lg font-semibold tabular-nums", remaining < 0 && "text-danger")}>
                {remaining}
              </dd>
            </div>
          </dl>
        ) : null}

        {overselling ? (
          <p className="text-sm text-danger" role="alert">
            Only {available} left in size {size}. Lower the quantity.
          </p>
        ) : null}

        {product && sizeRow && requested > 0 && !overselling ? (
          <p className="text-sm text-muted">
            Total {formatPrice(product.selling_price * requested)} · profit{" "}
            {formatPrice(product.profit_per_unit * requested)}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer name (optional)" htmlFor="sale-customer">
            <Input
              id="sale-customer"
              autoComplete="off"
              maxLength={120}
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </Field>
          <Field label="Customer phone (optional)" htmlFor="sale-phone">
            <Input
              id="sale-phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              maxLength={20}
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
            />
          </Field>
        </div>

        {error && !overselling ? (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
