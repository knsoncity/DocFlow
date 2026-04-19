"use client";

import { useEffect, useRef } from "react";

export type ToastType = "success" | "error" | "info";

export type ToastItem = {
  id: string;
  message: string;
  type: ToastType;
};

const ICONS: Record<ToastType, string> = {
  success: "✓",
  error: "✕",
  info: "i",
};

const STYLES: Record<ToastType, string> = {
  success: "bg-emerald-500 text-white",
  error: "bg-red-500 text-white",
  info: "border border-[var(--border-strong)] bg-[var(--bg)] text-[var(--text)]",
};

export function ToastItem({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(toast.id), 3500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg text-[14px] font-medium ${STYLES[toast.type]}`}
    >
      <span aria-hidden="true" className="shrink-0 text-[12px] font-bold w-4 text-center">
        {ICONS[toast.type]}
      </span>
      <span>{toast.message}</span>
      <button
        type="button"
        aria-label="닫기"
        onClick={() => onDismiss(toast.id)}
        className="ml-1 shrink-0 rounded opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}

export function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  return (
    <div
      aria-label="알림"
      className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 items-end pointer-events-none"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
