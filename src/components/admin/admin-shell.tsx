"use client";

import Link from "next/link";
import { Suspense, useState, type ReactNode } from "react";
import { useAdminSession } from "@/components/admin/admin-session";
import {
  BottomNav,
  BottomNavFallback,
  SidebarNav,
  SidebarNavFallback,
} from "@/components/admin/admin-nav";
import { Modal } from "@/components/ui/modal";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ToastProvider } from "@/components/ui/toast";

export function AdminShell({ children }: { children: ReactNode }) {
  const { admin, signOut } = useAdminSession();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <ToastProvider>
      <div className="min-h-dvh bg-surface-muted/60 lg:grid lg:grid-cols-[248px_1fr]">
        <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface px-4 py-5 lg:flex">
          <Brand />
          <nav aria-label="Admin" className="mt-8 flex-1">
            <Suspense fallback={<SidebarNavFallback />}>
              <SidebarNav />
            </Suspense>
          </nav>
          <div className="border-t border-border pt-4">
            <p className="truncate px-3 text-sm font-medium">{admin.name}</p>
            <p className="truncate px-3 text-xs text-muted">{admin.email}</p>
            <button
              type="button"
              onClick={signOut}
              className="mt-3 flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted hover:bg-foreground/5 hover:text-foreground"
            >
              <LogoutIcon />
              Log out
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
            <div className="lg:hidden">
              <Brand />
            </div>
            <Link
              href="/"
              target="_blank"
              className="hidden text-sm text-muted hover:text-foreground lg:inline"
            >
              View store ↗
            </Link>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label="Open menu"
                aria-haspopup="dialog"
                className="inline-flex size-11 items-center justify-center rounded-full border border-border lg:hidden"
              >
                <svg className="size-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </header>

          <main id="main" className="flex-1 px-4 py-6 pb-28 sm:px-6 lg:px-8 lg:py-8 lg:pb-12">
            {children}
          </main>
        </div>

        <nav
          aria-label="Admin quick"
          className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
        >
          <Suspense fallback={<BottomNavFallback />}>
            <BottomNav />
          </Suspense>
        </nav>

        <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu" variant="sheet" size="sm">
          <nav aria-label="Admin menu">
            <Suspense fallback={<SidebarNavFallback />}>
              <SidebarNav onNavigate={() => setMenuOpen(false)} />
            </Suspense>
          </nav>
          <div className="mt-4 border-t border-border pt-4">
            <p className="px-3 text-sm font-medium">{admin.name}</p>
            <p className="px-3 text-xs text-muted">{admin.email}</p>
            <Link
              href="/"
              target="_blank"
              className="mt-3 flex h-11 items-center rounded-lg px-3 text-sm text-muted hover:bg-foreground/5"
            >
              View store ↗
            </Link>
            <button
              type="button"
              onClick={signOut}
              className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-danger hover:bg-danger-soft"
            >
              <LogoutIcon />
              Log out
            </button>
          </div>
        </Modal>
      </div>
    </ToastProvider>
  );
}

function Brand() {
  return (
    <Link href="/admin" className="flex items-baseline gap-2 px-1">
      <span className="font-display text-2xl tracking-[0.22em]">URBAN</span>
      <span className="text-xs font-medium tracking-wide text-muted uppercase">Admin</span>
    </Link>
  );
}

function LogoutIcon() {
  return (
    <svg className="size-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M8 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3m5-3 3-3-3-3m3 3H8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
