"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { Button } from "@/components/ui/button";

export function Hero() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const context = gsap.context(() => {
      gsap.from("[data-hero-item]", {
        y: 18,
        autoAlpha: 0,
        duration: 0.7,
        stagger: 0.08,
        ease: "power2.out",
      });
    }, root);

    return () => context.revert();
  }, []);

  return (
    <div
      ref={rootRef}
      className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 text-center"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(ellipse_at_bottom,var(--border),transparent_70%)]"
      />
      <p data-hero-item className="text-xs tracking-[0.42em] text-muted uppercase">
        Clothing
      </p>
      <h1
        data-hero-item
        className="mt-5 font-display text-7xl leading-none tracking-[0.18em] text-secondary sm:text-8xl lg:text-9xl dark:text-primary"
      >
        URBAN
      </h1>
      <p data-hero-item className="mt-5 max-w-xs text-lg text-foreground sm:max-w-none sm:text-xl">
        Elevate Your Everyday.
      </p>
      <div data-hero-item className="mt-10">
        <Button href="/products" size="lg">
          Shop Now
        </Button>
      </div>
    </div>
  );
}
