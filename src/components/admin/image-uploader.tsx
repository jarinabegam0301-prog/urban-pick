"use client";

import { useId, useRef, useState } from "react";
import { ProductImage } from "@/components/ui/product-image";
import { cn } from "@/lib/cn";
import { adminApi } from "@/services/admin";

const MAX_IMAGES = 8;
const ACCEPT = "image/jpeg,image/png,image/webp";

export function ImageUploader({
  images,
  onChange,
}: {
  images: string[];
  onChange: (images: string[]) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const room = MAX_IMAGES - images.length;
    const selected = Array.from(files).slice(0, room);
    if (files.length > room) setError(`You can add up to ${MAX_IMAGES} images.`);

    setUploading(selected.length);
    const uploaded: string[] = [];
    for (const file of selected) {
      try {
        const { url } = await adminApi.uploadImage(file);
        uploaded.push(url);
      } catch (err) {
        setError(err instanceof Error ? `${file.name}: ${err.message}` : `Couldn't upload ${file.name}.`);
      }
      setUploading((n) => n - 1);
    }
    onChange([...images, ...uploaded]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(index: number) {
    onChange(images.filter((_, i) => i !== index));
  }

  function makeCover(index: number) {
    const next = [...images];
    const [picked] = next.splice(index, 1);
    onChange([picked, ...next]);
  }

  return (
    <div>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {images.map((src, index) => (
          <li key={src} className="group relative aspect-[4/5] overflow-hidden rounded-xl border border-border">
            <ProductImage src={src} alt={`Product image ${index + 1}`} sizes="160px" />
            {index === 0 ? (
              <span className="absolute top-2 left-2 rounded-full bg-foreground px-2 py-0.5 text-[11px] font-medium text-background">
                Cover
              </span>
            ) : null}
            <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/60 to-transparent p-1.5">
              {index > 0 ? (
                <button
                  type="button"
                  onClick={() => makeCover(index)}
                  className="h-9 rounded-md bg-white/90 px-2 text-xs font-medium text-black"
                >
                  Make cover
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={`Remove image ${index + 1}`}
                className="inline-flex size-9 items-center justify-center rounded-md bg-white/90 text-black"
              >
                <svg className="size-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </li>
        ))}

        {Array.from({ length: uploading }, (_, i) => (
          <li key={`uploading-${i}`} className="aspect-[4/5] animate-pulse rounded-xl bg-surface-muted" aria-label="Uploading" />
        ))}

        {images.length + uploading < MAX_IMAGES ? (
          <li>
            <label
              htmlFor={inputId}
              className={cn(
                "flex aspect-[4/5] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong text-center text-sm text-muted transition-colors hover:border-foreground hover:text-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-foreground",
              )}
            >
              <svg className="size-6" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              Add images
              <input
                ref={inputRef}
                id={inputId}
                type="file"
                accept={ACCEPT}
                multiple
                className="sr-only"
                onChange={(e) => upload(e.target.files)}
              />
            </label>
          </li>
        ) : null}
      </ul>
      <p className="mt-2 text-sm text-muted">JPG, PNG or WebP, up to 5 MB each. The first image is the cover.</p>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
