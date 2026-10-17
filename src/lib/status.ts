import type { ProductStatus, StockEventType } from "@/types/admin";

export type Tone = "success" | "warning" | "info" | "danger" | "neutral";

export const PRODUCT_STATUS: Record<ProductStatus, { label: string; tone: Tone }> = {
  in_stock: { label: "In stock", tone: "success" },
  low_stock: { label: "Low stock", tone: "warning" },
  partially_sold_out: { label: "Partially sold out", tone: "info" },
  sold_out: { label: "Sold out", tone: "danger" },
};

export const PRODUCT_STATUS_OPTIONS = Object.entries(PRODUCT_STATUS).map(([value, meta]) => ({
  value: value as ProductStatus,
  label: meta.label,
}));

export const STOCK_EVENT_LABEL: Record<StockEventType, string> = {
  stock_added: "Stock added",
  stock_sold: "Sold",
  stock_adjusted: "Stock adjusted",
  size_marked_sold_out: "Size marked sold out",
  product_marked_sold_out: "Product marked sold out",
};
