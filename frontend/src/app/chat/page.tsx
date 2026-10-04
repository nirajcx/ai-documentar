"use client";

import { MessageSquare, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ProtectedRoute } from "@/components/ProtectedRoute";

export default function ChatPage() {
  return (
    <ProtectedRoute>
      <div className="flex flex-col h-full space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Document Chat</h1>
            <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              Ollama · llama3.1:8b
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Query your documents with vector retrieval and citations.
          </p>
        </div>

        <section className="flex min-h-72 flex-1 flex-col items-center justify-center py-16 text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white/40 dark:bg-zinc-900/40">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 shadow-sm">
            <MessageSquare className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Start a conversation</h2>
          <p className="mt-2 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
            Ask any question about your uploaded documents. Vector similarity search will extract relevant excerpts.
          </p>
        </section>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
          <label htmlFor="composer" className="mb-2 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
            Ask AI-Documenter
          </label>
          <Textarea
            id="composer"
            placeholder="e.g. Summarize the key findings from the quarterly architecture review..."
            className="min-h-[90px] resize-none"
          />
          <div className="mt-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>Context: All indexed documents</span>
            </div>
            <Button className="bg-emerald-700 hover:bg-emerald-800 text-white gap-2 cursor-pointer">
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </Button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
