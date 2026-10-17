"use client";

import { useState, type FormEvent } from "react";
import { ImageUploader } from "@/components/admin/image-uploader";
import { Panel } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import type { AdminCategory, AdminProduct, ProductInput } from "@/types/admin";
import { SIZES, type Size } from "@/types/store";

export type ProductFormValues = ProductInput & { sizes?: { size: Size; quantity: number }[] };

type Errors = Partial<Record<"name" | "category" | "cost" | "selling" | "original" | "sizes", string>>;

function toMoney(text: string): number | null {
  if (text.trim() === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : Number.NaN;
}

export function ProductForm({
  categories,
  product,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  categories: AdminCategory[];
  /** When set, the form edits details only; stock is managed separately. */
  product?: AdminProduct;
  submitLabel: string;
  onSubmit: (values: ProductFormValues) => Promise<void>;
  onCancel?: () => void;
}) {
  const editing = Boolean(product);
  const [name, setName] = useState(product?.name ?? "");
  const [categoryId, setCategoryId] = useState(product?.category.id ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [cost, setCost] = useState(product ? String(product.cost_price) : "");
  const [selling, setSelling] = useState(product ? String(product.selling_price) : "");
  const [original, setOriginal] = useState(product?.original_price != null ? String(product.original_price) : "");
  const [images, setImages] = useState<string[]>(product?.images ?? []);
  const [published, setPublished] = useState(product?.is_published ?? true);
  const [quantities, setQuantities] = useState<Record<Size, string>>(
    () => Object.fromEntries(SIZES.map((s) => [s, "0"])) as Record<Size, string>,
  );
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const costValue = toMoney(cost);
  const sellingValue = toMoney(selling);
  const profit =
    costValue != null && sellingValue != null && !Number.isNaN(costValue) && !Number.isNaN(sellingValue)
      ? sellingValue - costValue
      : null;
  const total = SIZES.reduce((sum, s) => sum + (Number.parseInt(quantities[s], 10) || 0), 0);

  function validate(): Errors {
    const next: Errors = {};
    const originalValue = toMoney(original);
    if (name.trim().length < 2) next.name = "Enter a product name.";
    if (!categoryId) next.category = "Choose a category.";
    if (costValue == null || Number.isNaN(costValue) || costValue < 0) next.cost = "Enter a valid cost price.";
    if (sellingValue == null || Number.isNaN(sellingValue) || sellingValue <= 0)
      next.selling = "Enter a valid selling price.";
    if (originalValue != null) {
      if (Number.isNaN(originalValue) || originalValue <= 0) next.original = "Enter a valid price or leave it empty.";
      else if (sellingValue != null && originalValue < sellingValue)
        next.original = "Original price must be at least the selling price.";
    }
    if (!editing) {
      const bad = SIZES.some((s) => {
        const n = Number(quantities[s]);
        return !Number.isInteger(n) || n < 0;
      });
      if (bad) next.sizes = "Quantities must be whole numbers, 0 or more.";
    }
    return next;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        category_id: categoryId,
        description: description.trim(),
        cost_price: costValue!,
        selling_price: sellingValue!,
        original_price: toMoney(original),
        images,
        is_published: published,
        sizes: editing
          ? undefined
          : SIZES.map((size) => ({ size, quantity: Number.parseInt(quantities[size], 10) || 0 })),
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't save the product.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <Panel title="Details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Product name" htmlFor="name" error={errors.name} className="sm:col-span-2">
            <Input
              id="name"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={Boolean(errors.name) || undefined}
              aria-describedby={errors.name ? "name-error" : undefined}
            />
          </Field>
          <Field label="Category" htmlFor="category" error={errors.category}>
            <Select
              id="category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              aria-invalid={Boolean(errors.category) || undefined}
            >
              <option value="">Choose a category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Visibility</span>
            <label className="flex h-11 cursor-pointer items-center gap-3 rounded-lg border border-border-strong px-3.5 text-sm">
              <input
                type="checkbox"
                checked={published}
                onChange={(e) => setPublished(e.target.checked)}
                className="size-4 accent-current"
              />
              Show in the store
            </label>
          </div>
          <Field label="Description" htmlFor="description" className="sm:col-span-2">
            <Textarea
              id="description"
              value={description}
              maxLength={2000}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </div>
      </Panel>

      <Panel title="Images">
        <ImageUploader images={images} onChange={setImages} />
      </Panel>

      <Panel title="Pricing" description="Cost price is private and never shown in the store.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Cost price (₹)" htmlFor="cost" error={errors.cost}>
            <Input
              id="cost"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              aria-invalid={Boolean(errors.cost) || undefined}
            />
          </Field>
          <Field label="Selling price (₹)" htmlFor="selling" error={errors.selling}>
            <Input
              id="selling"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={selling}
              onChange={(e) => setSelling(e.target.value)}
              aria-invalid={Boolean(errors.selling) || undefined}
            />
          </Field>
          <Field
            label="Original price (₹)"
            htmlFor="original"
            hint="Optional. Shown struck through."
            error={errors.original}
          >
            <Input
              id="original"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={original}
              onChange={(e) => setOriginal(e.target.value)}
              aria-invalid={Boolean(errors.original) || undefined}
            />
          </Field>
        </div>
        {profit != null ? (
          <p className={cn("mt-4 text-sm", profit < 0 ? "text-danger" : "text-success")}>
            Profit per unit: <span className="font-semibold">{formatPrice(profit)}</span>
            {profit < 0 ? " — selling below cost" : null}
          </p>
        ) : null}
      </Panel>

      {!editing ? (
        <Panel title="Stock by size" description="How many pieces you have of each size.">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {SIZES.map((size) => (
              <Field key={size} label={size} htmlFor={`qty-${size}`}>
                <Input
                  id={`qty-${size}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={quantities[size]}
                  onChange={(e) => setQuantities((q) => ({ ...q, [size]: e.target.value }))}
                  className="text-center tabular-nums"
                />
              </Field>
            ))}
          </div>
          {errors.sizes ? (
            <p role="alert" className="mt-3 text-sm text-danger">
              {errors.sizes}
            </p>
          ) : null}
          <p className="mt-4 text-sm">
            Total quantity: <span className="font-semibold tabular-nums">{total}</span>
          </p>
        </Panel>
      ) : null}

      {formError ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" loading={saving}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
