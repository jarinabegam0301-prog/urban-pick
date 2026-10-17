import { clientFetch, queryString } from "@/lib/api";
import type {
  AdminCategory,
  AdminProduct,
  AdminSettings,
  AdminUser,
  Dashboard,
  ProductInput,
  ProductStatus,
  Sale,
  SalesPage,
  SalesPeriod,
  StockEvent,
} from "@/types/admin";
import type { Page, Size } from "@/types/store";

const json = (body: unknown) => JSON.stringify(body);

export const adminApi = {
  login: (email: string, password: string) =>
    clientFetch<AdminUser>("/auth/login", { method: "POST", body: json({ email, password }) }),
  logout: () => clientFetch<void>("/auth/logout", { method: "POST" }),
  me: () => clientFetch<AdminUser>("/auth/me"),
  changePassword: (currentPassword: string, newPassword: string) =>
    clientFetch<void>("/auth/change-password", {
      method: "POST",
      body: json({ current_password: currentPassword, new_password: newPassword }),
    }),

  dashboard: () => clientFetch<Dashboard>("/admin/dashboard"),
  categories: () => clientFetch<AdminCategory[]>("/admin/categories"),
  createCategory: (name: string) =>
    clientFetch<AdminCategory>("/admin/categories", {
      method: "POST",
      body: json({ name }),
    }),
  updateCategory: (id: string, name: string) =>
    clientFetch<AdminCategory>(`/admin/categories/${id}`, {
      method: "PUT",
      body: json({ name }),
    }),
  deleteCategory: (id: string) =>
    clientFetch<void>(`/admin/categories/${id}`, { method: "DELETE" }),

  products: (params: {
    q?: string;
    category?: string;
    status?: ProductStatus | "";
    sort?: string;
    page?: number;
    page_size?: number;
  }) => clientFetch<Page<AdminProduct>>(`/admin/products${queryString(params)}`),
  product: (id: string) => clientFetch<AdminProduct>(`/admin/products/${id}`),
  createProduct: (input: ProductInput & { sizes: { size: Size; quantity: number }[] }) =>
    clientFetch<AdminProduct>("/admin/products", { method: "POST", body: json(input) }),
  updateProduct: (id: string, input: ProductInput) =>
    clientFetch<AdminProduct>(`/admin/products/${id}`, { method: "PUT", body: json(input) }),
  deleteProduct: (id: string) => clientFetch<void>(`/admin/products/${id}`, { method: "DELETE" }),
  updateStock: (id: string, sizes: { size: Size; initial_quantity: number }[], note?: string) =>
    clientFetch<AdminProduct>(`/admin/products/${id}/stock`, {
      method: "PATCH",
      body: json({ sizes, note: note || null }),
    }),
  markSoldOut: (id: string) =>
    clientFetch<AdminProduct>(`/admin/products/${id}/sold-out`, { method: "PATCH" }),
  markSizeSoldOut: (id: string, size: Size) =>
    clientFetch<AdminProduct>(`/admin/products/${id}/sizes/${size}/sold-out`, { method: "PATCH" }),
  productHistory: (id: string) => clientFetch<StockEvent[]>(`/admin/products/${id}/history`),

  inventory: (params: { q?: string; page?: number; page_size?: number }) =>
    clientFetch<Page<AdminProduct>>(`/admin/inventory${queryString(params)}`),
  stockEvents: (limit = 30) => clientFetch<StockEvent[]>(`/admin/stock-events?limit=${limit}`),

  sales: (period: SalesPeriod, page: number) =>
    clientFetch<SalesPage>(`/admin/sales${queryString({ period, page })}`),
  recordSale: (input: {
    product_id: string;
    size: Size;
    quantity: number;
    customer_name?: string;
    customer_phone?: string;
  }) => clientFetch<Sale>("/admin/sales", { method: "POST", body: json(input) }),
  cancelSale: (id: string) => clientFetch<Sale>(`/admin/sales/${id}/cancel`, { method: "POST" }),

  settings: () => clientFetch<AdminSettings>("/admin/settings"),
  updateSettings: (lowStockThreshold: number) =>
    clientFetch<AdminSettings>("/admin/settings", {
      method: "PUT",
      body: json({ low_stock_threshold: lowStockThreshold }),
    }),

  uploadImage: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return clientFetch<{ url: string }>("/admin/uploads", { method: "POST", body });
  },
};
