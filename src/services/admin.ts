import { ApiError, throwSupabaseError } from "@/lib/api";
import { MAX_PRODUCT_IMAGE_SIZE } from "@/lib/config";
import { getSupabaseClient } from "@/lib/supabase";
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
  SalesSummary,
  StockEvent,
  StockRow,
} from "@/types/admin";
import type { Page, Size } from "@/types/store";

const PRODUCT_SELECT = `
  id,name,slug,description,category,cost_price,selling_price,original_price,images,sizes,
  total_quantity,sold_quantity,available_quantity,profit_per_unit,estimated_profit,status,
  is_published,created_at,updated_at
`;

type AdminRow = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: AdminCategory;
  cost_price: number | string;
  selling_price: number | string;
  original_price: number | string | null;
  images: string[];
  sizes: AdminProduct["sizes"];
  total_quantity: number;
  sold_quantity: number;
  available_quantity: number;
  profit_per_unit: number | string;
  estimated_profit: number | string;
  status: ProductStatus;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

type SaleRow = {
  id: string;
  product_id: string;
  product_name: string;
  size: Size;
  quantity: number;
  selling_price: number | string;
  cost_price: number | string;
  profit: number | string;
  customer_name: string | null;
  customer_phone: string | null;
  status: Sale["status"];
  created_at: string;
};

type QueryError = {
  code?: string;
  message?: string;
  status?: number;
};

async function fetchAllRows<T>(
  load: (start: number, end: number) => Promise<{ data: T[] | null; error: QueryError | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  const batchSize = 1000;
  for (let start = 0; ; start += batchSize) {
    const { data, error } = await load(start, start + batchSize - 1);
    if (error) throwSupabaseError(error);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < batchSize) return rows;
  }
}

function mapAdmin(row: AdminRow): AdminUser {
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

function mapProduct(row: ProductRow): AdminProduct {
  return {
    ...row,
    cost_price: Number(row.cost_price),
    selling_price: Number(row.selling_price),
    original_price: row.original_price === null ? null : Number(row.original_price),
    profit_per_unit: Number(row.profit_per_unit),
    estimated_profit: Number(row.estimated_profit),
  };
}

function mapSale(row: SaleRow): Sale {
  const sellingPrice = Number(row.selling_price);
  const costPrice = Number(row.cost_price);
  return {
    id: row.id,
    product_id: row.product_id,
    product_name: row.product_name,
    size: row.size,
    quantity: row.quantity,
    selling_price: sellingPrice,
    cost_price: costPrice,
    revenue: sellingPrice * row.quantity,
    profit: Number(row.profit),
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    status: row.status,
    created_at: row.created_at,
  };
}

async function requireAdmin(): Promise<AdminUser> {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getUser();
  if (error?.name === "AuthSessionMissingError") {
    throw new ApiError("Your admin session has expired. Sign in again.", 401);
  }
  if (error) throwSupabaseError(error);
  if (!data.user) throw new ApiError("Your admin session has expired. Sign in again.", 401);

  const { data: row, error: profileError } = await client
    .from("admins")
    .select("id,name,email,role")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) throwSupabaseError(profileError);
  if (!row) throw new ApiError("This account does not have admin access.", 401);
  return mapAdmin(row as AdminRow);
}

async function adminAction<T>(action: (admin: AdminUser) => Promise<T>): Promise<T> {
  const admin = await requireAdmin();
  return action(admin);
}

async function getProduct(id: string): Promise<AdminProduct> {
  const { data, error } = await getSupabaseClient()
    .from("admin_products")
    .select(PRODUCT_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throwSupabaseError(error);
  if (!data) throw new ApiError("Product not found.", 404);
  return mapProduct(data as ProductRow);
}

async function getSettings(admin: AdminUser): Promise<AdminSettings> {
  const { data, error } = await getSupabaseClient()
    .from("app_settings")
    .select("key,value")
    .in("key", ["low_stock_threshold", "whatsapp_number", "timezone"]);
  if (error) throwSupabaseError(error);
  const values = new Map((data ?? []).map((row) => [row.key, row.value]));
  const threshold = Number(values.get("low_stock_threshold"));
  const timezone = values.get("timezone");
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 1000 || !timezone) {
    throw new ApiError("Supabase store settings are missing or invalid.", 500);
  }
  return {
    low_stock_threshold: threshold,
    whatsapp_number: values.get("whatsapp_number") || null,
    timezone,
    storage: "supabase",
    admin_email: admin.email,
  };
}

function makeSlug(text: string): string {
  const slug = text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || "product";
}

function makePage<T>(items: T[], total: number, page: number, pageSize: number): Page<T> {
  return { items, total, page, page_size: pageSize, pages: Math.ceil(total / pageSize) };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

async function listProducts(params: {
  q?: string;
  category?: string;
  status?: ProductStatus | "";
  sort?: string;
  page?: number;
  page_size?: number;
}): Promise<Page<AdminProduct>> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.page_size ?? 10));
  let request = getSupabaseClient()
    .from("admin_products")
    .select(PRODUCT_SELECT, { count: "exact" });

  if (params.q?.trim()) request = request.ilike("name", `%${escapeLike(params.q.trim())}%`);
  if (params.category) request = request.eq("category->>slug", params.category);
  if (params.status) request = request.eq("status", params.status);

  switch (params.sort) {
    case "price_asc":
      request = request.order("selling_price", { ascending: true }).order("created_at", { ascending: false });
      break;
    case "price_desc":
      request = request.order("selling_price", { ascending: false }).order("created_at", { ascending: false });
      break;
    case "name_asc":
      request = request.order("name", { ascending: true });
      break;
    case "stock_asc":
      request = request.order("available_quantity", { ascending: true }).order("created_at", { ascending: false });
      break;
    default:
      request = request.order("created_at", { ascending: false });
  }

  const start = (page - 1) * pageSize;
  const { data, count, error } = await request.range(start, start + pageSize - 1);
  if (error) throwSupabaseError(error);
  return makePage(((data ?? []) as ProductRow[]).map(mapProduct), count ?? 0, page, pageSize);
}

function localDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function localMidnightUtc(date: string, timeZone: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const targetUtc = Date.UTC(year, month - 1, day);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(targetUtc));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  );
  return new Date(targetUtc - (asUtc - targetUtc)).toISOString();
}

function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, day + days));
  return `${moved.getUTCFullYear()}-${String(moved.getUTCMonth() + 1).padStart(2, "0")}-${String(moved.getUTCDate()).padStart(2, "0")}`;
}

function startOfPeriod(period: SalesPeriod, timeZone: string, now: Date): string | null {
  if (period === "all") return "2000-01-01T00:00:00.000Z";
  const today = localDate(now, timeZone);
  let date = today;
  if (period === "week") {
    const [year, month, day] = today.split("-").map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    date = shiftDate(today, -((weekday + 6) % 7));
  } else if (period === "month") {
    date = `${today.slice(0, 7)}-01`;
  } else if (period === "year") {
    date = `${today.slice(0, 4)}-01-01`;
  }
  return localMidnightUtc(date, timeZone);
}

function summarizeSales(rows: SaleRow[]): SalesSummary {
  return rows.reduce<SalesSummary>((summary, row) => {
    if (row.status !== "confirmed") return summary;
    summary.orders += 1;
    summary.units += row.quantity;
    summary.revenue += Number(row.selling_price) * row.quantity;
    summary.profit += Number(row.profit);
    return summary;
  }, { orders: 0, units: 0, revenue: 0, profit: 0 });
}

function stockRow(product: AdminProduct): StockRow {
  return {
    product_id: product.id,
    name: product.name,
    total: product.total_quantity,
    available: product.available_quantity,
    sold: product.sold_quantity,
    status: product.status,
  };
}

export const adminApi = {
  login: async (email: string, password: string): Promise<AdminUser> => {
    const client = getSupabaseClient();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      throw new ApiError("Email or password is incorrect.", 401);
    }
    try {
      return await requireAdmin();
    } catch (error) {
      const { error: signOutError } = await client.auth.signOut();
      if (signOutError) throwSupabaseError(signOutError);
      throw error;
    }
  },

  logout: async (): Promise<void> => {
    const { error } = await getSupabaseClient().auth.signOut();
    if (error) throwSupabaseError(error);
  },

  me: () => requireAdmin(),

  changePassword: async (currentPassword: string, newPassword: string): Promise<void> =>
    adminAction(async (admin) => {
      const client = getSupabaseClient();
      const { error: verificationError } = await client.auth.signInWithPassword({
        email: admin.email,
        password: currentPassword,
      });
      if (verificationError) throw new ApiError("Current password is incorrect.", 400);
      const { error } = await client.auth.updateUser({ password: newPassword });
      if (error) throwSupabaseError(error);
    }),

  dashboard: () => adminAction(async (admin) => {
    const client = getSupabaseClient();
    const now = new Date();
    const settings = await getSettings(admin);
    const chartStartDate = shiftDate(localDate(now, settings.timezone), -29);
    const yearStartDate = `${localDate(now, settings.timezone).slice(0, 4)}-01-01`;
    const from = localMidnightUtc(
      chartStartDate < yearStartDate ? chartStartDate : yearStartDate,
      settings.timezone,
    );
    const [products, sales] = await Promise.all([
      fetchAllRows<ProductRow>(async (start, end) => {
        const { data, error } = await client.from("admin_products")
          .select(PRODUCT_SELECT)
          .order("created_at", { ascending: false })
          .range(start, end);
        return { data: data as ProductRow[] | null, error };
      }),
      fetchAllRows<SaleRow>(async (start, end) => {
        const { data, error } = await client.from("admin_sales")
          .select("*")
          .gte("created_at", from)
          .order("created_at", { ascending: true })
          .range(start, end);
        return { data: data as SaleRow[] | null, error };
      }),
    ]);

    const mappedProducts = products.map(mapProduct);
    const confirmed = sales.filter((sale) => sale.status === "confirmed");
    const summaries = {
      today: summarizeSales(confirmed.filter((sale) => localDate(new Date(sale.created_at), settings.timezone) === localDate(now, settings.timezone))),
      week: summarizeSales(confirmed.filter((sale) => new Date(sale.created_at) >= new Date(startOfPeriod("week", settings.timezone, now)!))),
      month: summarizeSales(confirmed.filter((sale) => new Date(sale.created_at) >= new Date(startOfPeriod("month", settings.timezone, now)!))),
      year: summarizeSales(confirmed.filter((sale) => new Date(sale.created_at) >= new Date(startOfPeriod("year", settings.timezone, now)!))),
    };
    const daily = new Map<string, { revenue: number; units: number }>();
    for (const sale of confirmed) {
      const date = localDate(new Date(sale.created_at), settings.timezone);
      const value = daily.get(date) ?? { revenue: 0, units: 0 };
      value.revenue += Number(sale.selling_price) * sale.quantity;
      value.units += sale.quantity;
      daily.set(date, value);
    }
    const chart = Array.from({ length: 30 }, (_, index) => {
      const date = shiftDate(chartStartDate, index);
      const value = daily.get(date) ?? { revenue: 0, units: 0 };
      return { date, ...value };
    });
    const inventoryRows = mappedProducts.map(stockRow).sort((a, b) => a.available - b.available);
    const lowStock = inventoryRows.filter(
      (row) => row.available > 0 && row.available < settings.low_stock_threshold,
    );
    const topProducts = mappedProducts
      .filter((product) => product.sold_quantity > 0)
      .map((product) => ({
        product_id: product.id,
        name: product.name,
        units: product.sold_quantity,
        revenue: product.selling_price * product.sold_quantity,
      }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 5);

    const dashboard: Dashboard = {
      kpis: {
        total_products: mappedProducts.length,
        available_products: mappedProducts.filter((product) => product.available_quantity > 0).length,
        sold_out_products: mappedProducts.filter((product) => product.available_quantity <= 0).length,
        total_stock: mappedProducts.reduce((sum, product) => sum + product.total_quantity, 0),
        remaining_stock: mappedProducts.reduce((sum, product) => sum + product.available_quantity, 0),
        sold_units: mappedProducts.reduce((sum, product) => sum + product.sold_quantity, 0),
        inventory_value: mappedProducts.reduce((sum, product) => sum + product.cost_price * product.available_quantity, 0),
        inventory_retail_value: mappedProducts.reduce((sum, product) => sum + product.selling_price * product.available_quantity, 0),
        estimated_profit: mappedProducts.reduce((sum, product) => sum + product.estimated_profit, 0),
      },
      low_stock_threshold: settings.low_stock_threshold,
      sales_overview: summaries,
      sales_chart: chart,
      inventory: inventoryRows.slice(0, 8),
      low_stock: lowStock.slice(0, 8),
      top_products: topProducts,
    };
    return dashboard;
  }),

  categories: () => adminAction(async () => {
    const { data, error } = await getSupabaseClient().from("categories").select("id,name,slug").order("name");
    if (error) throwSupabaseError(error);
    return (data ?? []) as AdminCategory[];
  }),

  createCategory: (name: string) => adminAction(async () => {
    const { data, error } = await getSupabaseClient().rpc("admin_create_category", { p_name: name });
    if (error) throwSupabaseError(error);
    return data as AdminCategory;
  }),

  updateCategory: (id: string, name: string) => adminAction(async () => {
    const { data, error } = await getSupabaseClient().rpc("admin_update_category", {
      p_category_id: id,
      p_name: name,
    });
    if (error) throwSupabaseError(error);
    return data as AdminCategory;
  }),

  deleteCategory: (id: string) => adminAction(async () => {
    const { error } = await getSupabaseClient().rpc("admin_delete_category", { p_category_id: id });
    if (error) throwSupabaseError(error);
  }),

  products: (params: {
    q?: string;
    category?: string;
    status?: ProductStatus | "";
    sort?: string;
    page?: number;
    page_size?: number;
  }) => adminAction(() => listProducts(params)),

  product: (id: string) => adminAction(() => getProduct(id)),

  createProduct: (input: ProductInput & { sizes: { size: Size; quantity: number }[] }) =>
    adminAction(async () => {
      const { data, error } = await getSupabaseClient().rpc("admin_create_product", {
        p_input: input,
        p_slug: makeSlug(input.name),
      });
      if (error) throwSupabaseError(error);
      return getProduct(data as string);
    }),

  updateProduct: (id: string, input: ProductInput) => adminAction(async () => {
    const { data, error } = await getSupabaseClient().rpc("admin_update_product", {
      p_product_id: id,
      p_input: input,
      p_slug: makeSlug(input.name),
    });
    if (error) throwSupabaseError(error);
    return getProduct(data as string);
  }),

  deleteProduct: (id: string) => adminAction(async () => {
    const { data, error } = await getSupabaseClient()
      .from("products")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) throwSupabaseError(error);
    if (!data) throw new ApiError("Product not found.", 404);
  }),

  updateStock: (id: string, sizes: { size: Size; initial_quantity: number }[], note?: string) =>
    adminAction(async () => {
      const { error } = await getSupabaseClient().rpc("admin_update_stock", {
        p_product_id: id,
        p_sizes: sizes,
        p_note: note || null,
      });
      if (error) throwSupabaseError(error);
      return getProduct(id);
    }),

  markSoldOut: (id: string) => adminAction(async () => {
    const { error } = await getSupabaseClient().rpc("admin_mark_sold_out", { p_product_id: id });
    if (error) throwSupabaseError(error);
    return getProduct(id);
  }),

  markSizeSoldOut: (id: string, size: Size) => adminAction(async () => {
    const { error } = await getSupabaseClient().rpc("admin_mark_size_sold_out", {
      p_product_id: id,
      p_size: size,
    });
    if (error) throwSupabaseError(error);
    return getProduct(id);
  }),

  productHistory: (id: string) => adminAction(async () => {
    const { data, error } = await getSupabaseClient()
      .from("admin_stock_events")
      .select("id,product_id,product_name,size,event_type,quantity_before,quantity_change,quantity_after,note,created_at")
      .eq("product_id", id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throwSupabaseError(error);
    return (data ?? []) as StockEvent[];
  }),

  inventory: (params: { q?: string; page?: number; page_size?: number }) =>
    adminAction(() => listProducts({ ...params, sort: "stock_asc", page_size: params.page_size ?? 20 })),

  stockEvents: (limit = 30) => adminAction(async () => {
    const { data, error } = await getSupabaseClient()
      .from("admin_stock_events")
      .select("id,product_id,product_name,size,event_type,quantity_before,quantity_change,quantity_after,note,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throwSupabaseError(error);
    return (data ?? []) as StockEvent[];
  }),

  sales: (period: SalesPeriod, page: number) => adminAction(async (admin) => {
    const client = getSupabaseClient();
    const settings = await getSettings(admin);
    const start = startOfPeriod(period, settings.timezone, new Date());
    const pageSize = 20;
    const currentPage = Math.max(1, Math.floor(page));

    let salesRequest = client.from("admin_sales").select("*", { count: "exact" });
    if (start) {
      salesRequest = salesRequest.gte("created_at", start);
    }
    const [{ data, count, error }, summaryRows] = await Promise.all([
      salesRequest.order("created_at", { ascending: false }).range((currentPage - 1) * pageSize, currentPage * pageSize - 1),
      fetchAllRows<SaleRow>(async (offset, end) => {
        let request = client.from("admin_sales").select("*").order("created_at", { ascending: false });
        if (start) request = request.gte("created_at", start);
        const { data: rows, error: summaryError } = await request.range(offset, end);
        return { data: rows as SaleRow[] | null, error: summaryError };
      }),
    ]);
    if (error) throwSupabaseError(error);

    const summaries = summarizeSales(summaryRows);
    return {
      items: ((data ?? []) as SaleRow[]).map(mapSale),
      total: count ?? 0,
      page: currentPage,
      page_size: pageSize,
      pages: Math.ceil((count ?? 0) / pageSize),
      summary: summaries,
    } satisfies SalesPage;
  }),

  recordSale: (input: {
    product_id: string;
    size: Size;
    quantity: number;
    customer_name?: string;
    customer_phone?: string;
  }) => adminAction(async () => {
    const { data, error } = await getSupabaseClient().rpc("admin_record_sale", {
      p_product_id: input.product_id,
      p_size: input.size,
      p_quantity: input.quantity,
      p_customer_name: input.customer_name?.trim() || null,
      p_customer_phone: input.customer_phone?.trim() || null,
    });
    if (error) throwSupabaseError(error);
    const { data: sale, error: saleError } = await getSupabaseClient()
      .from("admin_sales")
      .select("*")
      .eq("id", data as string)
      .single();
    if (saleError) throwSupabaseError(saleError);
    return mapSale(sale as SaleRow);
  }),

  cancelSale: (id: string) => adminAction(async () => {
    const { error } = await getSupabaseClient().rpc("admin_cancel_sale", { p_sale_id: id });
    if (error) throwSupabaseError(error);
    const { data, error: saleError } = await getSupabaseClient()
      .from("admin_sales")
      .select("*")
      .eq("id", id)
      .single();
    if (saleError) throwSupabaseError(saleError);
    return mapSale(data as SaleRow);
  }),

  settings: () => adminAction(getSettings),

  updateSettings: (lowStockThreshold: number) => adminAction(async (admin) => {
    const { error } = await getSupabaseClient().rpc("admin_update_settings", {
      p_low_stock_threshold: lowStockThreshold,
    });
    if (error) throwSupabaseError(error);
    return getSettings(admin);
  }),

  uploadImage: (file: File) => adminAction(async () => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      throw new ApiError("Upload a JPG, PNG or WebP image.", 415);
    }
    if (file.size > MAX_PRODUCT_IMAGE_SIZE) {
      throw new ApiError("Images must be 5 MB or smaller.", 413);
    }
    const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const path = `${crypto.randomUUID()}.${extension}`;
    const { error } = await getSupabaseClient()
      .storage
      .from("product-images")
      .upload(path, file, { cacheControl: "3600", contentType: file.type, upsert: false });
    if (error) throwSupabaseError(error);
    const { data } = getSupabaseClient().storage.from("product-images").getPublicUrl(path);
    return { url: data.publicUrl };
  }),
};
