"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { adminApi } from "@/services/admin";
import type { AdminUser } from "@/types/admin";

type Session = {
  admin: AdminUser;
  signOut: () => Promise<void>;
  /** Call when an API request returns 401. */
  expire: () => void;
};

const SessionContext = createContext<Session | null>(null);

export function useAdminSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useAdminSession must be used inside AdminSessionProvider");
  return session;
}

/**
 * Hides the portal until the API confirms the session. The API checks every
 * admin request itself; this only avoids flashing private screens.
 */
export function AdminSessionProvider({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: ReactNode;
}) {
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const expire = useCallback(() => {
    setAdmin(null);
    router.replace("/admin/login");
  }, [router]);

  useEffect(() => {
    let active = true;
    adminApi
      .me()
      .then((user) => {
        if (active) setAdmin(user);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) router.replace("/admin/login");
        else setError(err instanceof Error ? err.message : "Can't reach the URBAN API.");
      });
    return () => {
      active = false;
    };
  }, [router]);

  const signOut = useCallback(async () => {
    await adminApi.logout().catch(() => undefined);
    setAdmin(null);
    router.replace("/admin/login");
  }, [router]);

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6 text-center">
        <div>
          <p className="font-medium">The admin portal can&apos;t reach the API.</p>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 h-11 rounded-lg border border-border-strong px-4 text-sm"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!admin) return fallback;

  return (
    <SessionContext.Provider value={{ admin, signOut, expire }}>{children}</SessionContext.Provider>
  );
}
