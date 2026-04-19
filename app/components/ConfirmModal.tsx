"use client";

import { useEffect, useRef } from "react";

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "확인",
  cancelLabel = "취소",
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
      aria-hidden="true"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={description ? "confirm-desc" : undefined}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-6 shadow-2xl"
      >
        <h2
          id="confirm-title"
          className="text-[16px] font-semibold text-[var(--text)]"
        >
          {title}
        </h2>
        {description && (
          <p id="confirm-desc" className="mt-2 text-[14px] text-[var(--text-subtle)]">
            {description}
          </p>
        )}
        <div className="mt-5 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-[14px] font-medium text-[var(--text-subtle)] hover:bg-[var(--bg-surface)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-[14px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
              danger
                ? "bg-red-500 text-white hover:bg-red-600 focus-visible:ring-red-500"
                : "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] focus-visible:ring-[var(--accent)]"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
