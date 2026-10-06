"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export function PdfPreview({ id, name, page = 1, onClose }: { id: string; name: string; page?: number; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    const controller = new AbortController();
    let objectUrl = "";
    void api.documentFile(id, controller.signal).then(blob => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not open PDF."); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id]);
  return <dialog ref={dialog} onCancel={onClose} className="m-auto w-[95vw] max-w-5xl h-[90dvh] rounded-xl p-4 bg-white dark:bg-[#191919] text-inherit backdrop:bg-black/50">
    <div className="flex gap-3 justify-between items-center mb-3"><h2 className="font-semibold truncate">{name} · Page {page}</h2><button autoFocus onClick={onClose} className="border rounded px-3 py-1">Close</button></div>
    {error ? <p role="alert">{error}</p> : url ? <><a href={`${url}#page=${page}`} target="_blank" rel="noreferrer" className="text-sm underline">Open PDF in a new tab</a><iframe title={`${name}, page ${page}`} src={`${url}#page=${page}`} className="w-full h-[calc(100%-5rem)] mt-2 border rounded" /></> : <p role="status">Loading PDF…</p>}
  </dialog>;
}
