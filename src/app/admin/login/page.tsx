import { LoginForm } from "@/components/admin/login-form";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-surface-muted/60">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
          <p className="font-display text-3xl tracking-[0.22em]">URBAN</p>
          <h1 className="mt-6 text-xl font-semibold">Admin sign in</h1>
          <p className="mt-1 text-sm text-muted">Manage products, stock and sales.</p>
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
