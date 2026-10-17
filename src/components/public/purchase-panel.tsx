"use client";

import { useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { buildPurchaseMessage, buildWhatsAppUrl } from "@/lib/whatsapp";
import type { PublicProduct, Size } from "@/types/store";

export function PurchasePanel({
  product,
  whatsappNumber,
}: {
  product: PublicProduct;
  whatsappNumber: string | null;
}) {
  const [selected, setSelected] = useState<Size | null>(null);
  const [showSizeError, setShowSizeError] = useState(false);
  const soldOut = product.status === "sold_out";
  const unavailable = product.sizes.filter((s) => !s.available).map((s) => s.size);

  const href =
    selected && whatsappNumber
      ? buildWhatsAppUrl(
          whatsappNumber,
          buildPurchaseMessage(product.name, selected, product.selling_price),
        )
      : null;

  return (
    <div className="flex flex-col gap-6">
      <fieldset>
        <div className="mb-3 flex items-baseline justify-between">
          <legend className="text-sm font-medium tracking-[0.14em] uppercase">Select size</legend>
          {selected ? <span className="text-sm text-muted">Size {selected} selected</span> : null}
        </div>
        <div role="radiogroup" aria-label="Size" className="grid grid-cols-5 gap-2">
          {product.sizes.map(({ size, available }) => {
            const isSelected = selected === size;
            return (
              <button
                key={size}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={!available}
                aria-label={available ? `Size ${size}` : `Size ${size}, sold out`}
                onClick={() => {
                  setSelected(size);
                  setShowSizeError(false);
                }}
                className={cn(
                  "relative flex h-13 flex-col items-center justify-center rounded-lg border text-sm font-medium transition-colors",
                  available && !isSelected && "border-border-strong hover:border-foreground",
                  isSelected && "border-foreground bg-foreground text-background",
                  !available &&
                    "cursor-not-allowed border-dashed border-border bg-surface-muted text-muted/60",
                )}
              >
                <span className={cn(!available && "line-through")}>{size}</span>
                {!available ? (
                  <span aria-hidden="true" className="text-[9px] tracking-wider uppercase no-underline">
                    Sold out
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {unavailable.length > 0 && !soldOut ? (
          <p className="mt-3 text-sm text-muted">
            {unavailable.map((size) => `${size} — Sold out`).join(" · ")}
          </p>
        ) : null}
        {showSizeError ? (
          <p className="mt-3 text-sm text-danger" role="alert">
            Select a size to continue.
          </p>
        ) : null}
      </fieldset>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        {soldOut ? (
          <button type="button" disabled className={buttonClasses("primary", "lg", "w-full")}>
            Sold out
          </button>
        ) : !whatsappNumber ? (
          <>
            <button type="button" disabled className={buttonClasses("primary", "lg", "w-full")}>
              Buy now
            </button>
            <p className="mt-2 text-center text-xs text-muted">
              Ordering opens once the store&apos;s WhatsApp number is set up.
            </p>
          </>
        ) : href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses("primary", "lg", "w-full")}
          >
            <WhatsAppIcon />
            Buy now
          </a>
        ) : (
          <button
            type="button"
            onClick={() => setShowSizeError(true)}
            className={buttonClasses("primary", "lg", "w-full")}
          >
            Buy now
          </button>
        )}
      </div>

      <p className="text-sm leading-relaxed text-muted">
        Buy now opens WhatsApp with the product and size filled in. We confirm availability and
        payment with you there.
      </p>
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z" />
    </svg>
  );
}
