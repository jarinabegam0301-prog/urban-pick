"use client";

import { useRouter } from "next/navigation";
import { useAdminSession } from "@/components/admin/admin-session";
import { PageHeader } from "@/components/admin/page-header";
import { ProductForm } from "@/components/admin/product-form";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { useApi } from "@/hooks/use-api";
import { adminApi } from "@/services/admin";

export function NewProductView() {
  const router = useRouter();
  const toast = useToast();
  const { expire } = useAdminSession();
  const categories = useApi(adminApi.categories, "categories", expire);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Add product" description="Details, images, prices and stock for each size." />
      {categories.error && !categories.data ? (
        <ErrorState message={categories.error} onRetry={categories.reload} />
      ) : !categories.data ? (
        <div className="flex flex-col gap-6" role="status" aria-label="Loading form">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      ) : (
        <ProductForm
          categories={categories.data}
          submitLabel="Create product"
          onCancel={() => router.push("/admin/products")}
          onSubmit={async (values) => {
            const { sizes, ...fields } = values;
            const product = await adminApi.createProduct({ ...fields, sizes: sizes ?? [] });
            toast.success(`${product.name} created.`);
            router.push(`/admin/products/${product.id}`);
          }}
        />
      )}
    </div>
  );
}
