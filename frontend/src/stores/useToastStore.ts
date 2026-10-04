import { create } from "zustand";

export type Toast = { id: number; message: string; kind: "success" | "error" | "info" };
let nextId = 0;

export const useToastStore = create<{ toasts: Toast[]; dismiss: (id: number) => void }>((set) => ({
  toasts: [],
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

export function notify(message: string, kind: Toast["kind"] = "success") {
  useToastStore.setState((state) => ({
    toasts: [...state.toasts.slice(-3), { id: ++nextId, message, kind }],
  }));
}
