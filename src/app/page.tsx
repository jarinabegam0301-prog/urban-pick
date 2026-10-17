import { Hero } from "@/components/public/hero";
import { SiteHeader } from "@/components/public/site-header";

export default function Home() {
  return (
    <section className="relative flex min-h-dvh flex-col bg-background">
      <SiteHeader overlay />
      <main id="main" className="flex flex-1 flex-col">
        <Hero />
      </main>
    </section>
  );
}
