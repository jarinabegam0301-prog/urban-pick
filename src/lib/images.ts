import { PUBLIC_API_URL } from "@/lib/config";

export function resolveImageUrl(url: string): string {
  return url.startsWith("/uploads/") ? `${PUBLIC_API_URL}${url}` : url;
}

export function isOptimizable(url: string): boolean {
  return url.startsWith("/uploads/");
}
