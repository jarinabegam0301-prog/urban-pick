"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Toast = { id: number; message: string; tone: "success" | "error" };

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: Toast["tone"]) => {
    const id = nextId++;
    setToasts((current) => [...current.slice(-2), { id, message, tone }]);
    window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 4000);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push(message, "success"),
      error: (message) => push(message, "error"),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto w-full max-w-sm rounded-xl border px-4 py-3 text-sm shadow-lg",
              toast.tone === "success"
                ? "border-border bg-foreground text-background"
                : "border-danger/30 bg-danger-soft text-danger backdrop-blur",
            )}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
