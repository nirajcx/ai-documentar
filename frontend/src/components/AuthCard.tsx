"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, Mail, User, KeyRound, Loader2 } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";

export function AuthCard({ onSuccess }: { onSuccess?: () => void }) {
  const { login, register: registerUser, isLoadingAuth, authError, clearError } = useAuthStore();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    clearError();
    try {
      if (isRegister) {
        await registerUser(email, username, password);
      } else {
        await login(email, password);
      }
      if (onSuccess) {
        onSuccess();
      } else {
        router.push("/chat");
      }
    } catch {
      // The store updates authError and fires a toast
    }
  }

  return (
    <section className="auth-card w-full max-w-md bg-white/95 dark:bg-[#1a1714]/95 backdrop-blur-md border border-[#e8dfd3] dark:border-[#332a20] p-8 rounded-2xl shadow-xl shadow-[#4a3b26]/5">
      <div className="w-12 h-12 flex items-center justify-center bg-[#f7f0e3] dark:bg-[#2e2518] text-[#96743d] dark:text-[#d4af6a] rounded-xl mb-6">
        <LockKeyhole className="w-6 h-6" />
      </div>

      <h2 className="text-2xl font-bold tracking-tight text-[#2a241e] dark:text-[#f3eee7] mb-2">
        {isRegister ? "Create your account" : "Sign in to AI-Documenter"}
      </h2>
      <p className="text-sm text-[#827566] dark:text-[#a89b8c] mb-6">
        {isRegister
          ? "Start intelligent document generation & vector search."
          : "Sign in to access your chat workspace and documents."}
      </p>

      {authError && (
        <div
          className="p-3.5 mb-5 text-xs text-red-700 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-lg break-words"
          role="alert"
        >
          {authError}
        </div>
      )}

      <form onSubmit={submit} className="flex flex-col gap-4">
        {isRegister && (
          <div>
            <label className="block text-xs font-semibold text-[#5e5141] dark:text-[#c4b5a3] mb-1.5">
              Username
            </label>
            <div className="relative">
              <User className="absolute left-3 top-3 w-4 h-4 text-[#a69888]" />
              <input
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="nirajsingh"
                className="w-full pl-9 pr-3.5 py-2.5 bg-[#fbf9f6] dark:bg-[#252019] border border-[#e8dfd3] dark:border-[#382f25] rounded-lg text-sm text-[#2a241e] dark:text-[#f3eee7] placeholder:text-[#a69888] focus:outline-none focus:ring-2 focus:ring-[#96743d]/30 focus:border-[#96743d] transition"
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-[#5e5141] dark:text-[#c4b5a3] mb-1.5">
            Email address
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-3 w-4 h-4 text-[#a69888]" />
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full pl-9 pr-3.5 py-2.5 bg-[#fbf9f6] dark:bg-[#252019] border border-[#e8dfd3] dark:border-[#382f25] rounded-lg text-sm text-[#2a241e] dark:text-[#f3eee7] placeholder:text-[#a69888] focus:outline-none focus:ring-2 focus:ring-[#96743d]/30 focus:border-[#96743d] transition"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#5e5141] dark:text-[#c4b5a3] mb-1.5">
            Password
          </label>
          <div className="relative">
            <KeyRound className="absolute left-3 top-3 w-4 h-4 text-[#a69888]" />
            <input
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full pl-9 pr-3.5 py-2.5 bg-[#fbf9f6] dark:bg-[#252019] border border-[#e8dfd3] dark:border-[#382f25] rounded-lg text-sm text-[#2a241e] dark:text-[#f3eee7] placeholder:text-[#a69888] focus:outline-none focus:ring-2 focus:ring-[#96743d]/30 focus:border-[#96743d] transition"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoadingAuth}
          className="mt-2 w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#96743d] hover:bg-[#83632f] disabled:opacity-50 text-white rounded-lg font-medium text-sm transition shadow-sm cursor-pointer"
        >
          {isLoadingAuth ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{isRegister ? "Creating account…" : "Signing you in…"}</span>
            </>
          ) : (
            <>
              <span>{isRegister ? "Create account" : "Sign in"}</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <div className="mt-6 pt-5 border-t border-[#f0e7db] dark:border-[#2f271e] flex flex-col items-center">
        <button
          type="button"
          onClick={() => {
            setIsRegister(!isRegister);
            clearError();
          }}
          className="text-xs font-medium text-[#96743d] dark:text-[#d4af6a] hover:underline cursor-pointer"
        >
          {isRegister
            ? "Already have an account? Sign in"
            : "Don't have an account? Create one"}
        </button>
        <p className="mt-4 text-[11px] text-[#9b8d7e]">
          AI-Documenter — Intelligent Knowledge & Document Automation
        </p>
      </div>
    </section>
  );
}
