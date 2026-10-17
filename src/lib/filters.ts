import { SIZES, type ProductFilters, type Size } from "@/types/store";

type RawParams = Record<string, string | string[] | undefined>;

const SORTS = ["newest", "price_asc", "price_desc", "name_asc"] as const;
const AVAILABILITY = ["all", "available", "sold_out"] as const;

export const SORT_OPTIONS: { value: NonNullable<ProductFilters["sort"]>; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "name_asc", label: "Name: A to Z" },
];

export const AVAILABILITY_OPTIONS: {
  value: NonNullable<ProductFilters["availability"]>;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "available", label: "Available" },
  { value: "sold_out", label: "Sold out" },
];

function first(value: string | string[] | undefined): string | undefined {
  const text = Array.isArray(value) ? value[0] : value;
  return text?.trim() || undefined;
}

function price(value: string | undefined): string | undefined {
  return value && /^\d{1,8}$/.test(value) ? value : undefined;
}

export function parseFilters(params: RawParams): ProductFilters {
  const sort = first(params.sort);
  const availability = first(params.availability);
  const size = first(params.size);
  const page = first(params.page);
  return {
    q: first(params.q)?.slice(0, 100),
    category: first(params.category)?.slice(0, 60),
    size: SIZES.includes(size as Size) ? (size as Size) : undefined,
    min_price: price(first(params.min_price)),
    max_price: price(first(params.max_price)),
    availability: AVAILABILITY.includes(availability as (typeof AVAILABILITY)[number])
      ? (availability as ProductFilters["availability"])
      : "all",
    sort: SORTS.includes(sort as (typeof SORTS)[number])
      ? (sort as ProductFilters["sort"])
      : "newest",
    page: page && /^\d{1,4}$/.test(page) && page !== "0" ? page : undefined,
  };
}

export function filtersToHref(filters: ProductFilters): string {
  const search = new URLSearchParams();
  if (filters.q) search.set("q", filters.q);
  if (filters.category) search.set("category", filters.category);
  if (filters.size) search.set("size", filters.size);
  if (filters.min_price) search.set("min_price", filters.min_price);
  if (filters.max_price) search.set("max_price", filters.max_price);
  if (filters.availability && filters.availability !== "all") {
    search.set("availability", filters.availability);
  }
  if (filters.sort && filters.sort !== "newest") search.set("sort", filters.sort);
  if (filters.page && filters.page !== "1") search.set("page", filters.page);
  const text = search.toString();
  return text ? `/products?${text}` : "/products";
}

export function activeFilterCount(filters: ProductFilters): number {
  return [
    filters.category,
    filters.size,
    filters.min_price || filters.max_price,
    filters.availability && filters.availability !== "all",
  ].filter(Boolean).length;
}
