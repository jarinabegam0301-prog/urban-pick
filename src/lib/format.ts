const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const rupeesWithPaise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numbers = new Intl.NumberFormat("en-IN");

export function formatPrice(value: number): string {
  return Number.isInteger(value) ? rupees.format(value) : rupeesWithPaise.format(value);
}

export function formatCompactPrice(value: number): string {
  if (Math.abs(value) >= 100000) {
    return `₹${(value / 100000).toFixed(value >= 1000000 ? 1 : 2).replace(/\.0+$/, "")}L`;
  }
  if (Math.abs(value) >= 1000) return `₹${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return formatPrice(value);
}

export function formatNumber(value: number): string {
  return numbers.format(value);
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDay(isoDate: string): string {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(
    new Date(`${isoDate}T00:00:00`),
  );
}
