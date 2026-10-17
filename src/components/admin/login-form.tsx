"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { adminApi } from "@/services/admin";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    adminApi
      .me()
      .then(() => {
        if (active) router.replace("/admin");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setSubmitting(true);
    try {
      await adminApi.login(email.trim(), password);
      router.replace("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(error) || undefined}
          required
        />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={Boolean(error) || undefined}
          required
        />
      </Field>
      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" loading={submitting} className="mt-2 w-full">
        Sign in
      </Button>
    </form>
  );
}
