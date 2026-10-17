import { formatPrice } from "@/lib/format";

export function buildPurchaseMessage(productName: string, size: string, price: number): string {
  return [
    "Hi Urban,",
    "",
    "I would like to purchase:",
    "",
    `Product: ${productName}`,
    `Size: ${size}`,
    `Price: ${formatPrice(price)}`,
    "",
    "Please confirm availability and order details.",
  ].join("\n");
}

export function buildWhatsAppUrl(number: string, message: string): string {
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
}
