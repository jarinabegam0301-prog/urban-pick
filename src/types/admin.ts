import type { Size } from "@/types/store";

export type ProductStatus = "in_stock" | "low_stock" | "partially_sold_out" | "sold_out";

export type AdminCategory = {
  id: string;
  name: string;
  slug: string;
};

export type AdminSize = {
  size: Size;
  initial_quantity: number;
  sold_quantity: number;
  available_quantity: number;
};

export type AdminProduct = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: AdminCategory;
  cost_price: number;
  selling_price: number;
  original_price: number | null;
  images: string[];
  sizes: AdminSize[];
  total_quantity: number;
  sold_quantity: number;
  available_quantity: number;
  profit_per_unit: number;
  estimated_profit: number;
  status: ProductStatus;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductInput = {
  name: string;
  category_id: string;
  description: string;
  cost_price: number;
  selling_price: number;
  original_price: number | null;
  images: string[];
  is_published: boolean;
};

export type SaleStatus = "pending" | "confirmed" | "cancelled";

export type Sale = {
  id: string;
  product_id: string;
  product_name: string;
  size: Size;
  quantity: number;
  selling_price: number;
  cost_price: number;
  revenue: number;
  profit: number;
  customer_name: string | null;
  customer_phone: string | null;
  status: SaleStatus;
  created_at: string;
};

export type SalesSummary = {
  orders: number;
  units: number;
  revenue: number;
  profit: number;
};

export type SalesPeriod = "today" | "week" | "month" | "year" | "all";

export type SalesPage = {
  items: Sale[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
  summary: SalesSummary;
};

export type StockEventType =
  | "stock_added"
  | "stock_sold"
  | "stock_adjusted"
  | "size_marked_sold_out"
  | "product_marked_sold_out";

export type StockEvent = {
  id: string;
  product_id: string;
  product_name: string;
  size: Size | null;
  event_type: StockEventType;
  quantity_before: number;
  quantity_change: number;
  quantity_after: number;
  note: string | null;
  created_at: string;
};

export type StockRow = {
  product_id: string;
  name: string;
  total: number;
  available: number;
  sold: number;
  status: ProductStatus;
};

export type Dashboard = {
  kpis: {
    total_products: number;
    available_products: number;
    sold_out_products: number;
    total_stock: number;
    remaining_stock: number;
    sold_units: number;
    inventory_value: number;
    inventory_retail_value: number;
    estimated_profit: number;
  };
  low_stock_threshold: number;
  sales_overview: Record<Exclude<SalesPeriod, "all">, SalesSummary>;
  sales_chart: { date: string; revenue: number; units: number }[];
  inventory: StockRow[];
  low_stock: StockRow[];
  top_products: { product_id: string; name: string; units: number; revenue: number }[];
};

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type AdminSettings = {
  low_stock_threshold: number;
  whatsapp_number: string | null;
  storage: "supabase";
  timezone: string;
  admin_email: string;
};
