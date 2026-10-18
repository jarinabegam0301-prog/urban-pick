"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAdminSession } from "@/components/admin/admin-session";
import { PageHeader, Panel } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { useApi } from "@/hooks/use-api";
import { adminApi } from "@/services/admin";
import type { AdminCategory, AdminSettings } from "@/types/admin";

export function SettingsView() {
  const { expire } = useAdminSession();
  const settings = useApi(adminApi.settings, "settings", expire);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" description="Store options and your account." />
      {settings.error && !settings.data ? (
        <ErrorState message={settings.error} onRetry={settings.reload} />
      ) : !settings.data ? (
        <div className="flex flex-col gap-6" role="status" aria-label="Loading settings">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <StockSettings settings={settings.data} onSaved={settings.setData} />
          <CategorySettings />
          <StoreInfo settings={settings.data} />
          <ChangePassword />
        </div>
      )}
    </div>
  );
}

function CategorySettings() {
  const { expire } = useAdminSession();
  const router = useRouter();
  const toast = useToast();
  const categories = useApi(adminApi.categories, "categories", expire);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = name.trim();
    if (value.length < 2 || value.length > 60) {
      setError("Enter a category name between 2 and 60 characters.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const saved = editing
        ? await adminApi.updateCategory(editing, value)
        : await adminApi.createCategory(value);
      const current = categories.data ?? [];
      categories.setData(
        (editing
          ? current.map((category) => (category.id === saved.id ? saved : category))
          : [...current, saved]
        ).sort((a, b) => a.name.localeCompare(b.name)),
      );
      setName("");
      setEditing(null);
      router.refresh();
      toast.success(editing ? "Category updated." : "Category added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the category.");
    } finally {
      setSaving(false);
    }
  }

  function startEditing(category: AdminCategory) {
    setEditing(category.id);
    setName(category.name);
    setError(null);
  }

  async function remove(category: AdminCategory) {
    setError(null);
    setBusyId(category.id);
    try {
      await adminApi.deleteCategory(category.id);
      categories.setData(categories.data?.filter((item) => item.id !== category.id) ?? []);
      router.refresh();
      toast.success("Category deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete the category.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Panel
      title="Categories"
      description="Manage the categories shown in the storefront and product forms."
    >
      {categories.error && !categories.data ? (
        <ErrorState message={categories.error} onRetry={categories.reload} />
      ) : !categories.data ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Loading categories">
          <Skeleton className="h-11 rounded-lg" />
          <Skeleton className="h-11 rounded-lg" />
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {categories.data.map((category) => (
              <li
                key={category.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0"
              >
                <div className="min-w-0">
                  <p className="font-medium">{category.name}</p>
                  <p className="text-xs text-muted">{category.slug}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => startEditing(category)}
                    disabled={saving || busyId !== null}
                  >
                    Rename
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void remove(category)}
                    loading={busyId === category.id}
                    disabled={saving || (busyId !== null && busyId !== category.id)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <form onSubmit={submit} noValidate className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Field
              label={editing ? "Rename category" : "New category"}
              htmlFor="category-name"
              hint="Use 2–60 characters. The category URL key is generated from its name."
              error={error}
              className="min-w-0 flex-1"
            >
              <Input
                id="category-name"
                value={name}
                maxLength={60}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={Boolean(error) || undefined}
              />
            </Field>
            <div className="flex gap-2 sm:mt-7">
              <Button type="submit" loading={saving}>
                {editing ? "Save name" : "Add category"}
              </Button>
              {editing ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setEditing(null);
                    setName("");
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        </>
      )}
    </Panel>
  );
}

function StockSettings({ settings, onSaved }: { settings: AdminSettings; onSaved: (s: AdminSettings) => void }) {
  const toast = useToast();
  const [threshold, setThreshold] = useState(String(settings.low_stock_threshold));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(threshold);
    if (!Number.isInteger(value) || value < 1 || value > 1000) {
      setError("Enter a whole number from 1 to 1000.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      onSaved(await adminApi.updateSettings(value));
      toast.success("Low stock threshold saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the setting.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="Stock alerts">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Field
          label="Low stock threshold"
          htmlFor="threshold"
          hint="A product is low on stock when fewer than this many pieces are left."
          error={error}
          className="flex-1"
        >
          <Input
            id="threshold"
            type="number"
            inputMode="numeric"
            min={1}
            max={1000}
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            aria-invalid={Boolean(error) || undefined}
            className="sm:max-w-40"
          />
        </Field>
        <Button type="submit" loading={saving} className="sm:mt-7">
          Save
        </Button>
      </form>
    </Panel>
  );
}

function StoreInfo({ settings }: { settings: AdminSettings }) {
  return (
    <Panel title="Store" description="Store configuration is kept in Supabase.">
      <dl className="divide-y divide-border text-sm">
        <div className="flex items-center justify-between gap-4 py-3">
          <dt className="text-muted">WhatsApp number</dt>
          <dd>
            {settings.whatsapp_number ? (
              <span className="tabular-nums">+{settings.whatsapp_number}</span>
            ) : (
              <Badge tone="warning">Not set — Buy Now is disabled</Badge>
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-3">
          <dt className="text-muted">Data storage</dt>
          <dd>
            <Badge tone="success">Supabase</Badge>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-3">
          <dt className="text-muted">Admin email</dt>
          <dd>{settings.admin_email}</dd>
        </div>
      </dl>
      {!settings.whatsapp_number ? (
        <p className="mt-3 text-sm text-muted">
          Set the <code className="rounded bg-surface-muted px-1.5 py-0.5">whatsapp_number</code>{" "}
          value in the Supabase <code className="rounded bg-surface-muted px-1.5 py-0.5">app_settings</code>{" "}
          table (country code and number, digits only).
        </p>
      ) : null}
    </Panel>
  );
}

function ChangePassword() {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current) return setError("Enter your current password.");
    if (next.length < 8) return setError("New password must be at least 8 characters.");
    if (next !== confirm) return setError("New passwords don't match.");
    setError(null);
    setSaving(true);
    try {
      await adminApi.changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Password changed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change the password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="Change password">
      <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label="Current password" htmlFor="current-password" className="sm:col-span-2">
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field label="New password" htmlFor="new-password" hint="At least 8 characters.">
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm-password">
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        {error ? (
          <p role="alert" className="text-sm text-danger sm:col-span-2">
            {error}
          </p>
        ) : null}
        <div className="sm:col-span-2">
          <Button type="submit" loading={saving}>
            Change password
          </Button>
        </div>
      </form>
    </Panel>
  );
}
