export function resolveImageUrl(url: string): string {
  return url;
}

export function isOptimizable(url: string): boolean {
  return url.startsWith("/uploads/");
}
