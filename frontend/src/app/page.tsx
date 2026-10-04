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
          <div className="w-16 h-16 rounded-2xl bg-[#f7f0e3] dark:bg-[#2b2216] text-[#96743d] dark:text-[#d4af6a] flex items-center justify-center shadow-inner">
            <UserCheck className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#96743d] dark:text-[#d4af6a]">
              Session Active
            </span>
            <h1 className="text-3xl font-bold tracking-tight text-[#2a241e] dark:text-[#f3eee7]">
              Welcome back, {user.username}!
            </h1>
            <p className="text-sm text-[#827566] dark:text-[#a89b8c]">
              Your AI-Documenter workspace is ready. You can query documents in chat or manage your document library.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 w-full pt-4">
            <Link
              href="/chat"
              className="flex flex-col items-start p-5 rounded-xl border border-[#e8dfd3] dark:border-[#332a20] bg-white dark:bg-[#1a1714] hover:border-[#c49d58] hover:shadow-md transition text-left group"
            >
              <div className="w-9 h-9 rounded-lg bg-[#f7f0e3] dark:bg-[#2b2216] text-[#96743d] dark:text-[#d4af6a] flex items-center justify-center mb-3">
                <MessageSquare className="w-5 h-5" />
              </div>
              <span className="font-semibold text-sm text-[#2a241e] dark:text-[#f3eee7] group-hover:text-[#96743d] dark:group-hover:text-[#d4af6a] transition flex items-center gap-1.5">
                Go to Chat <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </span>
              <span className="text-xs text-[#827566] mt-1">Ask questions with RAG retrieval</span>
            </Link>

            <Link
              href="/documents"
              className="flex flex-col items-start p-5 rounded-xl border border-[#e8dfd3] dark:border-[#332a20] bg-white dark:bg-[#1a1714] hover:border-[#c49d58] hover:shadow-md transition text-left group"
            >
              <div className="w-9 h-9 rounded-lg bg-[#f7f0e3] dark:bg-[#2b2216] text-[#96743d] dark:text-[#d4af6a] flex items-center justify-center mb-3">
                <Files className="w-5 h-5" />
              </div>
              <span className="font-semibold text-sm text-[#2a241e] dark:text-[#f3eee7] group-hover:text-[#96743d] dark:group-hover:text-[#d4af6a] transition flex items-center gap-1.5">
                Documents <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </span>
              <span className="text-xs text-[#827566] mt-1">Browse and upload document files</span>
            </Link>
          </div>

          <div className="pt-4 border-t border-[#e8dfd3] dark:border-[#332a20] w-full flex justify-between items-center text-xs text-[#827566]">
            <span>Signed in as <strong className="text-[#4a3b26] dark:text-[#f3eee7]">{user.email}</strong></span>
            <button
              onClick={() => void logout()}
              className="inline-flex items-center gap-1.5 text-[#827566] hover:text-red-600 transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-12 gap-12 items-center my-auto py-8">
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-[#f7f0e3] dark:bg-[#2b2216] text-[#8c6d3b] dark:text-[#d4af6a] border border-[#e5d5be] dark:border-[#423522]">
              <Sparkles className="w-3.5 h-3.5 text-[#96743d]" />
              <span>AI-Powered Documentation & RAG Workspace</span>
            </div>

            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-[#2a241e] dark:text-[#f3eee7] leading-[1.15]">
              Document intelligence, <br />
              <span className="text-[#96743d] dark:text-[#d4af6a]">simplified and fast.</span>
            </h1>

            <p className="text-base text-[#6b5e50] dark:text-[#b8aa9a] max-w-lg leading-relaxed">
              Upload documents, query institutional knowledge with vector search, and automate documentation generation seamlessly.
            </p>

            <div className="grid sm:grid-cols-2 gap-4 pt-4 max-w-lg">
              <div className="p-4 rounded-xl border border-[#e8dfd3] dark:border-[#332a20] bg-white/70 dark:bg-[#1a1714]/70 shadow-xs">
                <div className="flex items-center gap-2.5 font-semibold text-sm text-[#2a241e] dark:text-[#f3eee7] mb-1">
                  <Bot className="w-4 h-4 text-[#96743d]" />
                  <span>Local RAG Pipeline</span>
                </div>
                <p className="text-xs text-[#827566] dark:text-[#a89b8c]">
                  Powered by Ollama embeddings and Postgres pgvector.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-[#e8dfd3] dark:border-[#332a20] bg-white/70 dark:bg-[#1a1714]/70 shadow-xs">
                <div className="flex items-center gap-2.5 font-semibold text-sm text-[#2a241e] dark:text-[#f3eee7] mb-1">
                  <ShieldCheck className="w-4 h-4 text-[#96743d]" />
                  <span>Direct Auth & Storage</span>
                </div>
                <p className="text-xs text-[#827566] dark:text-[#a89b8c]">
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
