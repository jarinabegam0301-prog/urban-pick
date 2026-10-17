export const SIZES = ["S", "M", "L", "XL", "XXL"] as const;
export type Size = (typeof SIZES)[number];

export type Category = {
  name: string;
  slug: string;
};

export type PublicSize = {
  size: Size;
  available: boolean;
};

export type PublicProduct = {
  id: string;
  name: string;
  slug: string;
  description: string;
  selling_price: number;
  original_price: number | null;
  images: string[];
  category: Category;
  sizes: PublicSize[];
  status: "available" | "sold_out";
};

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
};

export type StoreConfig = {
  whatsapp_number: string | null;
  currency: string;
};

export type ProductFilters = {
  q?: string;
  category?: string;
  size?: Size;
  min_price?: string;
  max_price?: string;
  availability?: "all" | "available" | "sold_out";
  sort?: "newest" | "price_asc" | "price_desc" | "name_asc";
  page?: string;
};
