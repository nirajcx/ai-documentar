"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, ArrowRight } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, refreshProfile } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function checkAuth() {
      await refreshProfile();
      setLoading(false);
    }
    void checkAuth();
  }, [refreshProfile]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-zinc-500">Checking authentication…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center max-w-md mx-auto space-y-5 p-8 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-lg">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
          <LockKeyhole className="w-7 h-7" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Authentication Required</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Please sign in to access your chat workspace and documents.
          </p>
        </div>
        <button
          onClick={() => router.push("/")}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium transition shadow-sm"
        >
          Sign In Now <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
