import { ApiError, throwSupabaseError } from "@/lib/api";
import { getSupabaseClient } from "@/lib/supabase";
import type { Category, Page, ProductFilters, PublicProduct, StoreConfig } from "@/types/store";

export const STORE_PAGE_SIZE = 12;

type StoreProductRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  selling_price: number | string;
  original_price: number | string | null;
  images: string[];
  category: Category;
  sizes: PublicProduct["sizes"];
  status: PublicProduct["status"];
  available_sizes: string[];
  available: boolean;
  created_at: string;
};

function mapProduct(row: StoreProductRow): PublicProduct {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    selling_price: Number(row.selling_price),
    original_price: row.original_price === null ? null : Number(row.original_price),
    images: row.images,
    category: row.category,
    sizes: row.sizes,
    status: row.status,
  };
}

export async function getProducts(filters: ProductFilters): Promise<Page<PublicProduct>> {
  const page = Math.max(1, Number.parseInt(filters.page ?? "1", 10) || 1);
  let request = getSupabaseClient()
    .from("store_products")
    .select("*", { count: "exact" });

  if (filters.q?.trim()) {
    const escaped = filters.q.trim().replace(/[\\%_]/g, "\\$&");
    request = request.ilike("name", `%${escaped}%`);
  }
  if (filters.category) request = request.eq("category->>slug", filters.category);
  if (filters.size) request = request.contains("available_sizes", [filters.size]);
  if (filters.min_price) request = request.gte("selling_price", Number(filters.min_price));
  if (filters.max_price) request = request.lte("selling_price", Number(filters.max_price));
  if (filters.availability === "available") request = request.eq("available", true);
  if (filters.availability === "sold_out") request = request.eq("available", false);

  switch (filters.sort) {
    case "price_asc":
      request = request.order("selling_price", { ascending: true }).order("created_at", { ascending: false });
      break;
    case "price_desc":
      request = request.order("selling_price", { ascending: false }).order("created_at", { ascending: false });
      break;
    case "name_asc":
      request = request.order("name", { ascending: true });
      break;
    default:
      request = request.order("created_at", { ascending: false });
  }

  const start = (page - 1) * STORE_PAGE_SIZE;
  const { data, count, error } = await request.range(start, start + STORE_PAGE_SIZE - 1);
  if (error) throwSupabaseError(error);

  const total = count ?? 0;
  return {
    items: ((data ?? []) as StoreProductRow[]).map(mapProduct),
    total,
    page,
    page_size: STORE_PAGE_SIZE,
    pages: Math.ceil(total / STORE_PAGE_SIZE),
  };
}

export async function getProduct(id: string): Promise<PublicProduct> {
  const { data, error } = await getSupabaseClient()
    .from("store_products")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throwSupabaseError(error);
  if (!data) throw new ApiError("Product not found.", 404);
  return mapProduct(data as StoreProductRow);
}

export async function getCategories(): Promise<Category[]> {
  const { data, error } = await getSupabaseClient()
    .from("store_categories")
    .select("name,slug")
    .order("name");
  if (error) throwSupabaseError(error);
  return (data ?? []) as Category[];
}

export async function getStoreConfig(): Promise<StoreConfig> {
  const { data, error } = await getSupabaseClient()
    .from("store_config")
    .select("whatsapp_number")
    .maybeSingle();
  if (error) throwSupabaseError(error);
  return { whatsapp_number: data?.whatsapp_number ?? null, currency: "INR" };
}
