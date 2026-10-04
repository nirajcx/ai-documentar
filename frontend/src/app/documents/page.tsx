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
            <h1 className="text-2xl font-bold tracking-tight text-[#2a241e] dark:text-[#f3eee7]">Documents</h1>
            <p className="mt-1 text-sm text-[#827566] dark:text-[#a89b8c]">
              Manage knowledge files, PDF reports, and vectorized attachments.
            </p>
          </div>
          <Button className="bg-[#96743d] hover:bg-[#83632f] text-white gap-2 cursor-pointer shadow-sm">
            <Plus className="w-4 h-4" />
            <span>Upload Document</span>
          </Button>
        </div>

        <section className="flex min-h-80 flex-col items-center justify-center text-center border border-dashed border-[#e0d6c7] dark:border-[#322b22] rounded-2xl bg-white/50 dark:bg-[#181512]/50 p-8">
          <div className="w-14 h-14 rounded-2xl bg-[#f7f0e3] dark:bg-[#2b2216] text-[#96743d] dark:text-[#d4af6a] flex items-center justify-center mb-4 shadow-sm">
            <UploadCloud className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-semibold text-[#2a241e] dark:text-[#f3eee7]">No documents uploaded yet</h2>
          <p className="mt-2 max-w-sm text-sm text-[#827566] dark:text-[#a89b8c]">
            Upload PDFs, Markdown, or text files. They will be stored in MinIO and indexed into PostgreSQL pgvector using <code className="text-xs bg-[#f2e9dc] dark:bg-[#252019] text-[#7a5d30] dark:text-[#e4c48b] px-1.5 py-0.5 rounded">nomic-embed-text</code>.
          </p>
          <Button variant="outline" className="mt-6 border-[#e8dfd3] dark:border-[#382f25] text-[#5e5141] dark:text-[#c4b5a3] hover:bg-[#f5efe6] dark:hover:bg-[#252019] gap-2 cursor-pointer">
            <Files className="w-4 h-4" />
            <span>Browse files</span>
          </Button>
        </section>
      </div>
    </ProtectedRoute>
  );
}
