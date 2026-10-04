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
        <div className="w-8 h-8 border-3 border-[#96743d] border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-[#827566]">Checking authentication…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center max-w-md mx-auto space-y-5 p-8 bg-white/80 dark:bg-[#1a1714]/80 backdrop-blur-md rounded-2xl border border-[#e8dfd3] dark:border-[#322b22] shadow-lg">
        <div className="w-14 h-14 rounded-2xl bg-[#f7f0e3] dark:bg-[#2e2518] text-[#96743d] dark:text-[#d4af6a] flex items-center justify-center">
          <LockKeyhole className="w-7 h-7" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-[#2a241e] dark:text-[#f3eee7]">Authentication Required</h2>
          <p className="text-sm text-[#827566] dark:text-[#a89b8c]">
            Please sign in to access your chat workspace and documents.
          </p>
        </div>
        <button
          onClick={() => router.push("/")}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#96743d] hover:bg-[#83632f] text-white rounded-lg text-sm font-medium transition shadow-sm cursor-pointer"
        >
          Sign In Now <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
