"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Sparkles, ShieldCheck, ArrowRight, UserCheck, MessageSquare, Files, LogOut } from "lucide-react";
import { AuthCard } from "@/components/AuthCard";
import { useAuthStore } from "@/stores/useAuthStore";

export default function Home() {
  const { user, refreshProfile, logout } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    refreshProfile();
  }, [refreshProfile]);

  return (
    <div className="flex flex-col min-h-full py-4 sm:py-8">
      {mounted && user ? (
        <div className="flex flex-col items-center justify-center py-12 text-center max-w-xl mx-auto space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shadow-inner">
            <UserCheck className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <span className="text-xs uppercase tracking-wider font-semibold text-emerald-700 dark:text-emerald-400">
              Session Active
            </span>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Welcome back, {user.username}!
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Your AI-Documenter workspace is ready. You can query documents in chat or manage your document library.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 w-full pt-4">
            <Link
              href="/chat"
              className="flex flex-col items-start p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-emerald-500/50 hover:shadow-md transition text-left group"
            >
              <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 flex items-center justify-center mb-3">
                <MessageSquare className="w-5 h-5" />
              </div>
              <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 group-hover:text-emerald-600 transition flex items-center gap-1.5">
                Go to Chat <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </span>
              <span className="text-xs text-zinc-400 mt-1">Ask questions with RAG retrieval</span>
            </Link>

            <Link
              href="/documents"
              className="flex flex-col items-start p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-emerald-500/50 hover:shadow-md transition text-left group"
            >
              <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center mb-3">
                <Files className="w-5 h-5" />
              </div>
              <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 group-hover:text-emerald-600 transition flex items-center gap-1.5">
                Documents <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </span>
              <span className="text-xs text-zinc-400 mt-1">Browse and upload document files</span>
            </Link>
          </div>

          <div className="pt-4 border-t border-zinc-200/80 dark:border-zinc-800 w-full flex justify-between items-center text-xs text-zinc-400">
            <span>Signed in as <strong className="text-zinc-600 dark:text-zinc-300">{user.email}</strong></span>
            <button
              onClick={() => void logout()}
              className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-red-600 transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-12 gap-12 items-center my-auto py-8">
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>AI-Powered Documentation & RAG Workspace</span>
            </div>

            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100 leading-[1.15]">
              Document intelligence, <br />
              <span className="text-emerald-700 dark:text-emerald-500">simplified and fast.</span>
            </h1>

            <p className="text-base text-zinc-600 dark:text-zinc-400 max-w-lg leading-relaxed">
              Upload documents, query institutional knowledge with vector search, and automate documentation generation seamlessly.
            </p>

            <div className="grid sm:grid-cols-2 gap-4 pt-4 max-w-lg">
              <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50">
                <div className="flex items-center gap-2.5 font-semibold text-sm text-zinc-900 dark:text-zinc-100 mb-1">
                  <Bot className="w-4 h-4 text-emerald-600" />
                  <span>Local RAG Pipeline</span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Powered by Ollama embeddings and Postgres pgvector.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50">
                <div className="flex items-center gap-2.5 font-semibold text-sm text-zinc-900 dark:text-zinc-100 mb-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Direct Auth & Storage</span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Argon2id password security, Redis caching, and MinIO S3 storage.
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 flex justify-center">
            <AuthCard onSuccess={() => router.push("/chat")} />
          </div>
        </div>
      )}
    </div>
  );
}
