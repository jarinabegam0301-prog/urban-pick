"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** "dialog" is centred; "sheet" rises from the bottom on phones. */
  variant?: "dialog" | "sheet";
  size?: "sm" | "md" | "lg";
};

const widths = { sm: "sm:max-w-md", md: "sm:max-w-xl", lg: "sm:max-w-3xl" };

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = "dialog",
  size = "md",
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        "hidden max-h-[92dvh] max-w-none flex-col overflow-hidden border border-border bg-surface p-0 text-foreground shadow-2xl open:flex",
        variant === "sheet"
          ? "mx-0 mt-auto mb-0 w-full rounded-t-2xl sm:m-auto sm:w-full sm:rounded-2xl"
          : "m-auto w-[calc(100%-1.5rem)] rounded-2xl sm:w-full",
        widths[size],
      )}
    >
      <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          {description ? (
            <div id={descriptionId} className="mt-1 text-sm text-muted">
              {description}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-foreground/5 hover:text-foreground"
        >
          <svg className="size-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      {children ? (
        <div data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {children}
        </div>
      ) : null}
      {footer ? (
        <footer className="flex flex-col-reverse gap-2 border-t border-border px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6">
          {footer}
        </footer>
      ) : null}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = false,
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "primary"}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
