"use client";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { useToastStore, Toast } from "@/stores/useToastStore";

export function ToastContainer() {
  const { toasts, dismiss } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="toaster fixed top-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast: Toast) => (
        <div
          key={toast.id}
          className={`toast pointer-events-auto flex items-start gap-3 p-4 bg-white dark:bg-zinc-900 border rounded-xl shadow-lg min-w-[280px] max-w-md ${
            toast.kind === "error"
              ? "border-l-4 border-l-red-500 border-zinc-200 dark:border-zinc-800"
              : toast.kind === "info"
              ? "border-l-4 border-l-blue-500 border-zinc-200 dark:border-zinc-800"
              : "border-l-4 border-l-emerald-600 border-zinc-200 dark:border-zinc-800"
          }`}
        >
          {toast.kind === "error" ? (
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          ) : toast.kind === "info" ? (
            <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          )}
          <span className="flex-1 text-xs text-zinc-800 dark:text-zinc-200 leading-snug break-words">
            {toast.message}
          </span>
          <button
            onClick={() => dismiss(toast.id)}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
