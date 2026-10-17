"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ErrorState } from "@/components/ui/states";

export function StoreError({ message }: { message: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  return (
    <ErrorState message={message} onRetry={() => startTransition(() => router.refresh())} />
  );
}
