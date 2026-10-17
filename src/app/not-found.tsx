import { SiteHeader } from "@/components/public/site-header";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main
        id="main"
        className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-6 text-center"
      >
        <p className="text-xs tracking-[0.32em] text-muted uppercase">Not found</p>
        <h1 className="mt-3 font-display text-4xl">This page isn&apos;t here</h1>
        <p className="mt-3 text-muted">The product may have been removed or the link is wrong.</p>
        <Button href="/products" size="lg" className="mt-8">
          Shop products
        </Button>
      </main>
    </div>
  );
}
