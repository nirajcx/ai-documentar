"use client";

import { Files, UploadCloud, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProtectedRoute } from "@/components/ProtectedRoute";

export default function DocumentsPage() {
  return (
    <ProtectedRoute>
      <div className="flex flex-col h-full space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Documents</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Manage knowledge files, PDF reports, and vectorized attachments.
            </p>
          </div>
          <Button className="bg-emerald-700 hover:bg-emerald-800 text-white gap-2 cursor-pointer shadow-sm">
            <Plus className="w-4 h-4" />
            <span>Upload Document</span>
          </Button>
        </div>

        <section className="flex min-h-80 flex-col items-center justify-center text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white/40 dark:bg-zinc-900/40 p-8">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 shadow-sm">
            <UploadCloud className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">No documents uploaded yet</h2>
          <p className="mt-2 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
            Upload PDFs, Markdown, or text files. They will be stored in MinIO and indexed into PostgreSQL pgvector using <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">nomic-embed-text</code>.
          </p>
          <Button variant="outline" className="mt-6 border-zinc-200 dark:border-zinc-700 gap-2 cursor-pointer">
            <Files className="w-4 h-4" />
            <span>Browse files</span>
          </Button>
        </section>
      </div>
    </ProtectedRoute>
  );
}
