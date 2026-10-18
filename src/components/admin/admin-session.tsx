"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { adminApi } from "@/services/admin";
import type { AdminUser } from "@/types/admin";

type Session = {
  admin: AdminUser;
  signOut: () => Promise<void>;
  /** Call when an admin request returns 401. */
  expire: () => void;
};

const SessionContext = createContext<Session | null>(null);

export function useAdminSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useAdminSession must be used inside AdminSessionProvider");
  return session;
}

/**
 * Hides the portal until Supabase confirms the admin session and profile.
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
        else setError(err instanceof Error ? err.message : "Can't reach Supabase.");
      });
    return () => {
      active = false;
    };
  }, [router]);

  const signOut = useCallback(async () => {
    try {
      await adminApi.logout();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign out.");
      return;
    }
    setAdmin(null);
    router.replace("/admin/login");
  }, [router]);

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6 text-center">
        <div>
          <p className="font-medium">The admin portal can&apos;t reach Supabase.</p>
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
