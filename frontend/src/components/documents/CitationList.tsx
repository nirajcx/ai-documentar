"use client";
import { useState } from "react";
import type { Citation, DocumentCitation } from "@/lib/types";
import { PdfPreview } from "./PdfPreview";

function webLink(value: string): string | null {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function CitationList({ citations }: { citations: Citation[] }) {
  const [preview, setPreview] = useState<DocumentCitation | null>(null);
  return <div className="mt-3 border-t pt-2 text-xs">
    <p className="font-semibold mb-2">Sources</p>
    <div className="space-y-2">{citations.map(source => {
      if (source.kind === "web") {
        const href = webLink(source.url);
        return <details key={`${source.label}-${source.url}`} className="rounded border p-2">
          <summary className="cursor-pointer">[{source.label}] Web · {source.title}</summary>
          {href && <a href={href} target="_blank" rel="noopener noreferrer" className="block underline mt-2 break-all">{source.url}</a>}
          <blockquote className="mt-2 whitespace-pre-wrap opacity-80">{source.excerpt}</blockquote>
          <p className="mt-2 opacity-70">Retrieved: {source.retrieved_at} (not publication date)</p>
        </details>;
      }
      return <details key={`${source.label}-${source.chunk_id}`} className="rounded border p-2">
        <summary className="cursor-pointer">[{source.label}] PDF · {source.filename} · p. {source.page_start}{source.page_end !== source.page_start ? `–${source.page_end}` : ""}</summary>
        <blockquote className="mt-2 whitespace-pre-wrap opacity-80">{source.excerpt}</blockquote>
        <button className="underline mt-2" onClick={() => setPreview(source)}>Open source PDF at page {source.page_start}</button>
      </details>;
    })}</div>
    {preview && <PdfPreview key={`${preview.document_id}-${preview.page_start}`} id={preview.document_id} name={preview.filename} page={preview.page_start} onClose={() => setPreview(null)} />}
  </div>;
}
