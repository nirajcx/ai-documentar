import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { api } from "@/lib/api";
import { UserProfile } from "@/lib/types";
import { notify } from "@/stores/useToastStore";

interface AuthState {
  user: UserProfile | null;
  isLoadingAuth: boolean;
  authError: string | null;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoadingAuth: false,
      authError: null,

      clearError: () => set({ authError: null }),

      login: async (email, password) => {
        set({ isLoadingAuth: true, authError: null });
        try {
          const res = await api.login({ email, password });
          set({ user: res.user, isLoadingAuth: false });
          notify("Welcome back! You're signed in to AI-Documenter.");
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Sign-in failed";
          set({ authError: msg, isLoadingAuth: false, user: null });
          notify(msg, "error");
          throw err;
        }
      },

      register: async (email, username, password) => {
        set({ isLoadingAuth: true, authError: null });
        try {
          await api.register({ email, username, password });
          notify("Account created. Signing you in…");
          await get().login(email, password);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Registration failed";
          set({ authError: msg, isLoadingAuth: false, user: null });
          notify(msg, "error");
          throw err;
        }
      },

      logout: async () => {
        try {
          await api.logout();
        } catch {
          // Ignore server errors during cleanup
        } finally {
          set({ user: null, authError: null });
          notify("You're signed out.", "success");
        }
      },

      refreshProfile: async () => {
        try {
          const profile = await api.getMe();
          set({ user: profile });
        } catch {
          set({ user: null });
        }
      },
    }),
    {
      name: "ai-documenter-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user }),
    }
  )
);
