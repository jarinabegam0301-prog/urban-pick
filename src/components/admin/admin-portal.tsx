"use client";

import type { ReactNode } from "react";
import { AdminSessionProvider } from "@/components/admin/admin-session";
import { AdminShell } from "@/components/admin/admin-shell";
import { Skeleton } from "@/components/ui/skeleton";

export function AdminPortal({ children }: { children: ReactNode }) {
  return (
    <AdminSessionProvider fallback={<PortalSkeleton />}>
      <AdminShell>{children}</AdminShell>
    </AdminSessionProvider>
  );
}

function PortalSkeleton() {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]" role="status" aria-label="Loading admin portal">
      <div className="hidden border-r border-border p-5 lg:block">
        <Skeleton className="h-7 w-32" />
        <div className="mt-8 flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      </div>
      <div className="p-6 lg:p-8">
        <Skeleton className="h-8 w-48" />
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
