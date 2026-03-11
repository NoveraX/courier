import { X } from "lucide-react"

import type { Toast } from "../store"

// ── Toast Overlay ───────────────────────────────────────────────────────────

export function ToastOverlay({
  toasts,
  onDismiss,
}: {
  toasts: Toast[]
  onDismiss: (id: string) => void
}) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-10 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs shadow-lg animate-slide-in ${
            toast.type === "error"
              ? "border-red-500/20 bg-red-500/10 text-red-400"
              : toast.type === "success"
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                : "border-border-default bg-surface-1 text-text-secondary"
          }`}
        >
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="shrink-0 text-text-muted hover:text-text-primary"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
