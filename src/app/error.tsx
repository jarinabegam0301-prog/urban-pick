"use client";

import { ErrorState } from "@/components/ui/states";

export default function Error({ retry }: { error: Error; retry: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center px-6">
      <ErrorState className="w-full" onRetry={() => retry()} />
    </main>
  );
}
