"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Files, UploadCloud, RefreshCw, Search, Trash2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PdfPreview } from "@/components/documents/PdfPreview";
import { api } from "@/lib/api";
import { documentStatusLabel, indexing, pdfValidationError } from "@/lib/documents";
import type { KnowledgeDocument } from "@/lib/types";
import { useAuthStore } from "@/stores/useAuthStore";

interface UploadItem { id: string; file: File; state: "waiting" | "uploading" | "uploaded" | "failed"; error?: string }

export default function DocumentsPage() {
  const userId = useAuthStore(state => state.user?.id);
  return <ProtectedRoute><Library key={userId ?? "signed-out"} /></ProtectedRoute>;
}

function Library() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState("");
  const [preview, setPreview] = useState<KnowledgeDocument | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const alive = useRef(false);
  const runningUpload = useRef(false);
  const uploadAbort = useRef<AbortController | null>(null);
  const requests = useRef(new Set<AbortController>());
  const listVersion = useRef(0);
  const actionLock = useRef(false);

  const refresh = useCallback(async () => {
    const version = ++listVersion.current;
    const controller = new AbortController();
    requests.current.add(controller);
    try {
      const items = await api.listDocuments(controller.signal);
      if (alive.current && version === listVersion.current) { setDocuments(items); setError(""); }
    } catch (err) {
      if (!controller.signal.aborted && alive.current && version === listVersion.current) setError(err instanceof Error ? err.message : "Could not load documents.");
    } finally {
      requests.current.delete(controller);
      if (alive.current && version === listVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const pending = requests.current;
    return () => { alive.current = false; pending.forEach(controller => controller.abort()); uploadAbort.current?.abort(); };
  }, [refresh]);

  useEffect(() => {
    if (!documents.some(doc => indexing(doc.status)) || error) return;
    const timer = setTimeout(() => void refresh(), 3000);
    return () => clearTimeout(timer);
  }, [documents, error, refresh]);

  function addFiles(files: FileList | File[]) {
    if (runningUpload.current) return;
    const added = Array.from(files).map(file => {
      const validation = pdfValidationError(file);
      return { id: crypto.randomUUID(), file, state: validation ? "failed" as const : "waiting" as const, error: validation ?? undefined };
    });
    setQueue(prev => [...prev, ...added.filter(item => !prev.some(old => old.file.name === item.file.name && old.file.size === item.file.size && old.state !== "failed"))]);
  }

  async function upload() {
    if (runningUpload.current) return;
    runningUpload.current = true;
    setUploading(true);
    const controller = new AbortController();
    uploadAbort.current = controller;
    for (const item of queue.filter(item => item.state === "waiting")) {
      if (controller.signal.aborted) break;
      setQueue(prev => prev.map(row => row.id === item.id ? { ...row, state: "uploading" } : row));
      try {
        await api.uploadDocument(item.file, controller.signal);
        if (controller.signal.aborted) break;
        setQueue(prev => prev.map(row => row.id === item.id ? { ...row, state: "uploaded" } : row));
        await refresh();
      } catch (err) {
        if (controller.signal.aborted) break;
        setQueue(prev => prev.map(row => row.id === item.id ? { ...row, state: "failed", error: err instanceof Error ? err.message : "Upload failed." } : row));
      }
    }
    if (alive.current) {
      setUploading(false);
      setQueue(prev => prev.map(row => row.state === "uploading" ? { ...row, state: "failed", error: "Upload stopped. Refresh the library before retrying; the server may have received it." } : row));
    }
    runningUpload.current = false;
    uploadAbort.current = null;
  }

  async function action(doc: KnowledgeDocument, remove: boolean) {
    if (actionLock.current) return;
    if (remove && !window.confirm(`Delete ${doc.filename} and remove it from document search?`)) return;
    actionLock.current = true;
    setBusyId(doc.id);
    const controller = new AbortController();
    requests.current.add(controller);
    try {
      if (remove) await api.deleteDocument(doc.id, controller.signal);
      else await api.retryDocument(doc.id, controller.signal);
      await refresh();
    } catch (err) { if (alive.current && !controller.signal.aborted) setError(err instanceof Error ? err.message : "Request failed."); }
    finally { requests.current.delete(controller); actionLock.current = false; if (alive.current) setBusyId(""); }
  }

  const shown = documents.filter(doc => doc.filename.toLowerCase().includes(query.toLowerCase()) && (filter === "all" || (filter === "processing" ? indexing(doc.status) : doc.status === filter)));
  return <div className="space-y-6 overflow-y-auto pb-8 h-full">
    <header className="flex flex-wrap justify-between items-center gap-3"><div><h1 className="text-2xl font-bold">Document library</h1><p className="mt-1 text-sm opacity-70">Upload PDFs, follow indexing, and use ready documents in chat.</p></div><Link href="/chat" className="border rounded-lg px-4 py-2 text-sm">Ask your documents</Link></header>
    <div className="grid grid-cols-3 gap-3">{[["Documents", documents.length], ["Ready", documents.filter(d => d.status === "ready").length], ["Processing", documents.filter(d => indexing(d.status)).length]].map(([label, count]) => <div key={label} className="border rounded-xl p-4"><p className="text-xs opacity-60">{label}</p><p className="text-2xl font-semibold mt-1">{count}</p></div>)}</div>
    <section onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }} className={`border-2 border-dashed rounded-2xl p-8 text-center ${dragging ? "border-[#96743d] bg-[#96743d]/10" : "border-[#96743d]/30"}`}>
      <UploadCloud className="mx-auto w-9 h-9 text-[#96743d]" /><h2 className="font-semibold mt-3">Drop your PDFs here</h2><p className="text-sm opacity-70 mt-1">Multiple PDFs · up to 25 MB each · text-based PDFs first</p>
      <p className="text-xs opacity-60 mt-1">Scanned pages need OCR before they can be searched.</p>
      <input ref={input} type="file" multiple accept="application/pdf,.pdf" className="hidden" aria-label="Choose PDF files" onChange={event => { if (event.target.files) addFiles(event.target.files); event.target.value = ""; }} />
      <Button variant="outline" disabled={uploading} onClick={() => input.current?.click()} className="mt-4 gap-2"><Files className="w-4 h-4" /> Browse PDFs</Button>
    </section>
    {queue.length > 0 && <section aria-label="Upload queue" className="border rounded-xl p-4 space-y-3"><div className="flex gap-2 justify-between items-center"><h2 className="font-semibold">Upload queue</h2><div className="flex gap-2"><Button variant="ghost" disabled={uploading} onClick={() => setQueue([])}>Clear queue</Button>{uploading ? <Button variant="outline" onClick={() => uploadAbort.current?.abort()}>Stop uploads</Button> : <Button disabled={!queue.some(row => row.state === "waiting")} onClick={() => void upload()}>Upload {queue.filter(row => row.state === "waiting").length} PDFs</Button>}</div></div>
      {queue.map(item => <div key={item.id} className="flex flex-wrap justify-between gap-2 border-t pt-2 text-sm"><div className="min-w-0"><p className="break-all">{item.file.name}</p><p className="text-xs opacity-60">{(item.file.size / 1024 / 1024).toFixed(1)} MB · {item.state === "uploaded" ? "Uploaded — indexing status below" : item.state}</p>{item.error && <p role="alert" className="text-red-600 text-xs">{item.error}</p>}</div>{item.state === "failed" && !pdfValidationError(item.file) && <button disabled={uploading} className="underline" onClick={() => setQueue(prev => prev.map(row => row.id === item.id ? { ...row, state: "waiting", error: undefined } : row))}>Retry upload</button>}</div>)}
    </section>}
    <section className="space-y-3"><div className="flex flex-wrap items-center gap-3"><h2 className="font-semibold mr-auto">Your documents</h2><label className="flex border rounded-lg px-3 py-2 gap-2 items-center"><Search className="w-4 h-4" /><input aria-label="Search documents" placeholder="Search filename" value={query} onChange={event => setQuery(event.target.value)} className="bg-transparent outline-none min-w-0 w-40" /></label><select aria-label="Filter by indexing status" value={filter} onChange={event => setFilter(event.target.value)} className="border rounded-lg p-2 bg-transparent"><option value="all">All statuses</option><option value="ready">Ready</option><option value="processing">Processing</option><option value="failed">Failed</option><option value="needs_ocr">Needs OCR</option></select><Button variant="outline" aria-label="Refresh documents" onClick={() => void refresh()}><RefreshCw className="w-4 h-4" /></Button></div>
      {error && <p role="alert" className="text-sm text-red-600">{error} Refresh to try again.</p>}
      {loading ? <p role="status">Loading documents…</p> : !shown.length && <p className="p-8 border rounded-xl text-center opacity-60">{documents.length ? "No documents match your filters." : error ? "Your library could not be loaded." : "Upload your first PDF to start building your knowledge library."}</p>}
      {shown.map(doc => <article key={doc.id} className="border rounded-xl p-4 flex flex-wrap gap-4 items-start"><FileText className="w-6 h-6 text-[#96743d] shrink-0" /><div className="flex-1 min-w-40"><h3 className="font-medium break-all">{doc.filename}</h3><p className="text-xs opacity-60 mt-1">{(doc.size_bytes / 1024 / 1024).toFixed(1)} MB · {doc.page_count ?? "—"} pages · {doc.chunk_count} chunks</p><p className={`text-xs mt-2 ${doc.status === "ready" ? "text-green-700 dark:text-green-400" : doc.status === "failed" ? "text-red-600" : "text-[#96743d]"}`}>{documentStatusLabel[doc.status]}</p>{indexing(doc.status) && <progress aria-label={`Indexing ${doc.filename}`} max={100} value={doc.progress === null ? undefined : Math.max(0, Math.min(100, doc.progress))} className="mt-2 w-full max-w-xs h-2" />}{doc.error && <p className="text-xs text-red-600 mt-1">{doc.error}</p>}</div><div className="flex gap-3 text-sm"><button className="underline" onClick={() => setPreview(doc)}>View PDF</button>{doc.status === "failed" && <button className="underline" disabled={Boolean(busyId)} onClick={() => void action(doc, false)}>Retry indexing</button>}<button aria-label={`Delete ${doc.filename}`} disabled={Boolean(busyId)} className="text-red-600 disabled:opacity-40" onClick={() => void action(doc, true)}><Trash2 className="w-4 h-4" /></button></div></article>)}
    </section>
    {preview && <PdfPreview key={preview.id} id={preview.id} name={preview.filename} onClose={() => setPreview(null)} />}
  </div>;
}
