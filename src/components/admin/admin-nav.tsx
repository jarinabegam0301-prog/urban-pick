"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const NAV_ITEMS: { href: string; label: string; icon: ReactNode }[] = [
  {
    href: "/admin",
    label: "Dashboard",
    icon: <path d="M3 10.5 10 4l7 6.5V17a1 1 0 0 1-1 1h-3.5v-5h-5v5H4a1 1 0 0 1-1-1v-6.5Z" />,
  },
  {
    href: "/admin/products",
    label: "Products",
    icon: <path d="M6 3 2.5 5.5l2 3.5L6 8.2V17h8V8.2l1.5.8 2-3.5L14 3h-2.5a1.5 1.5 0 0 1-3 0H6Z" />,
  },
  {
    href: "/admin/inventory",
    label: "Inventory",
    icon: <path d="M3 6.5 10 3l7 3.5v7L10 17l-7-3.5v-7Zm0 0L10 10m0 0 7-3.5M10 10v7" />,
  },
  {
    href: "/admin/sales",
    label: "Sales",
    icon: <path d="M3 16h14M5 13V9m4 4V5m4 8v-6m4 6V4" />,
  },
  {
    href: "/admin/settings",
    label: "Settings",
    icon: (
      <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm6.5-2.5-1.6-.6-.3-.8.7-1.5-1.4-1.4-1.5.7-.8-.3L11 4.5H9l-.6 1.6-.8.3-1.5-.7-1.4 1.4.7 1.5-.3.8-1.6.6v2l1.6.6.3.8-.7 1.5 1.4 1.4 1.5-.7.8.3.6 1.6h2l.6-1.6.8-.3 1.5.7 1.4-1.4-.7-1.5.3-.8 1.6-.6v-2Z" />
    ),
  },
];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

function NavIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="size-5 shrink-0"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                active
                  ? "bg-foreground text-background"
                  : "text-muted hover:bg-foreground/5 hover:text-foreground",
              )}
            >
              <NavIcon>{item.icon}</NavIcon>
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function SidebarNavFallback() {
  return (
    <ul className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            className="flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted"
          >
            <NavIcon>{item.icon}</NavIcon>
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

const BOTTOM_ITEMS = NAV_ITEMS.slice(0, 4);

export function BottomNav() {
  const pathname = usePathname();
  return (
    <ul className="grid grid-cols-4">
      {BOTTOM_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                active ? "text-foreground" : "text-muted",
              )}
            >
              <NavIcon>{item.icon}</NavIcon>
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function BottomNavFallback() {
  return (
    <ul className="grid grid-cols-4">
      {BOTTOM_ITEMS.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            className="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted"
          >
            <NavIcon>{item.icon}</NavIcon>
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
