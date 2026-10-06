"use client";
import { useState } from "react";
import type { Citation } from "@/lib/types";
import { PdfPreview } from "./PdfPreview";

export function CitationList({ citations }: { citations: Citation[] }) {
  const [preview, setPreview] = useState<Citation | null>(null);
  return <div className="mt-3 border-t pt-2 text-xs">
    <p className="font-semibold mb-2">Sources</p>
    <div className="space-y-2">{citations.map(source => <details key={`${source.label}-${source.chunk_id}`} className="rounded border p-2">
      <summary className="cursor-pointer">[{source.label}] {source.filename} · p. {source.page_start}{source.page_end !== source.page_start ? `–${source.page_end}` : ""}</summary>
      <blockquote className="mt-2 whitespace-pre-wrap opacity-80">{source.excerpt}</blockquote>
      <button className="underline mt-2" onClick={() => setPreview(source)}>Open source PDF at page {source.page_start}</button>
    </details>)}</div>
    {preview && <PdfPreview key={`${preview.document_id}-${preview.page_start}`} id={preview.document_id} name={preview.filename} page={preview.page_start} onClose={() => setPreview(null)} />}
  </div>;
}
