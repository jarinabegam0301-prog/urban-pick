"use client";

import { useState } from "react";
import { ProductImage } from "@/components/ui/product-image";
import { cn } from "@/lib/cn";

export function ProductGallery({
  images,
  name,
  category,
  soldOut,
}: {
  images: string[];
  name: string;
  category: string;
  soldOut: boolean;
}) {
  const [active, setActive] = useState(0);
  const current = images[active];

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-surface-muted">
        <ProductImage
          src={current}
          alt={images.length > 1 ? `${name}, image ${active + 1} of ${images.length}` : name}
          category={category}
          sizes="(min-width: 1024px) 50vw, 100vw"
          priority
          className={soldOut ? "opacity-70" : undefined}
        />
        {soldOut ? (
          <span className="absolute top-4 left-4 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium tracking-[0.16em] text-background uppercase">
            Sold out
          </span>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Product images">
          {images.map((image, index) => (
            <button
              key={image}
              type="button"
              onClick={() => setActive(index)}
              aria-label={`Show image ${index + 1}`}
              aria-current={index === active}
              className={cn(
                "relative aspect-[4/5] w-16 shrink-0 overflow-hidden rounded-lg border-2 sm:w-20",
                index === active ? "border-foreground" : "border-transparent opacity-70",
              )}
            >
              <ProductImage src={image} alt="" sizes="80px" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
