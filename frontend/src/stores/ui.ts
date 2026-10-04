"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type UIState = {
  sidebarOpen: boolean; // Mobile overlay open state
  sidebarCollapsed: boolean; // Desktop collapsed state (like ChatGPT/Claude)
  toggleSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebarCollapse: () => void;
  setSidebarCollapse: (collapsed: boolean) => void;
};

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: false,
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      closeSidebar: () => set({ sidebarOpen: false }),
      toggleSidebarCollapse: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapse: (collapsed: boolean) => set({ sidebarCollapsed: collapsed }),
    }),
    {
      name: "ai-documenter-ui",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
