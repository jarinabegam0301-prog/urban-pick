import { queryString, serverFetch } from "@/lib/api";
import type { Category, Page, ProductFilters, PublicProduct, StoreConfig } from "@/types/store";

export const STORE_PAGE_SIZE = 12;

export function getProducts(filters: ProductFilters): Promise<Page<PublicProduct>> {
  return serverFetch(
    `/products${queryString({
      q: filters.q,
      category: filters.category,
      size: filters.size,
      min_price: filters.min_price,
      max_price: filters.max_price,
      availability: filters.availability === "all" ? undefined : filters.availability,
      sort: filters.sort === "newest" ? undefined : filters.sort,
      page: filters.page,
      page_size: STORE_PAGE_SIZE,
    })}`,
  );
}

export function getProduct(id: string): Promise<PublicProduct> {
  return serverFetch(`/products/${encodeURIComponent(id)}`);
}

export function getCategories(): Promise<Category[]> {
  return serverFetch("/categories");
}

export function getStoreConfig(): Promise<StoreConfig> {
  return serverFetch("/config");
}
