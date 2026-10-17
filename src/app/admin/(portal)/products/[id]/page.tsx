import { Suspense } from "react";
import { ProductEditor, ProductEditorSkeleton } from "@/components/admin/product-editor";

export default function EditProductPage({ params }: PageProps<"/admin/products/[id]">) {
  return (
    <Suspense fallback={<ProductEditorSkeleton />}>
      <ProductEditor params={params} />
    </Suspense>
  );
}
