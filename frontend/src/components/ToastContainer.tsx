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
          className={`toast pointer-events-auto flex items-start gap-3 p-4 bg-white dark:bg-[#1a1714] border rounded-xl shadow-lg min-w-[280px] max-w-md ${
            toast.kind === "error"
              ? "border-l-4 border-l-red-500 border-[#e8dfd3] dark:border-[#322b22]"
              : toast.kind === "info"
              ? "border-l-4 border-l-sky-500 border-[#e8dfd3] dark:border-[#322b22]"
              : "border-l-4 border-l-[#96743d] border-[#e8dfd3] dark:border-[#322b22]"
          }`}
        >
          {toast.kind === "error" ? (
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          ) : toast.kind === "info" ? (
            <Info className="w-5 h-5 text-sky-500 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-[#96743d] shrink-0 mt-0.5" />
          )}
          <span className="flex-1 text-xs text-[#2a241e] dark:text-[#f3eee7] leading-snug break-words">
            {toast.message}
          </span>
          <button
            onClick={() => dismiss(toast.id)}
            className="text-[#a89b8c] hover:text-[#5e5141] dark:hover:text-[#f3eee7] p-0.5 cursor-pointer"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
