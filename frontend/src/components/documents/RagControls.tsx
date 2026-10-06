"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { KnowledgeDocument, RagOptions } from "@/lib/types";

export function RagControls({
  value,
  onChange,
  disabled,
}: {
  value: RagOptions;
  onChange: (value: RagOptions) => void;
  disabled: boolean;
}) {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const [capabilities, items] = await Promise.all([
          api.documentCapabilities(controller.signal),
          api.listDocuments(controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setReady(capabilities.chat_ready);
        setDocuments(items.filter((item) => item.status === "ready"));
        setError(
          capabilities.chat_ready
            ? ""
            : "Document search is not available yet. General chat still works.",
        );
      } catch {
        if (!controller.signal.aborted) {
          setReady(false);
          setError("Document search is unavailable. General chat still works.");
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [revision]);
  const selectedValid = value.document_ids.filter((id) =>
    documents.some((doc) => doc.id === id),
  );
  return (
    <details className="border rounded-lg p-3 text-sm mb-3 shrink-0">
      <summary className="cursor-pointer font-medium">
        Document sources ·{" "}
        {value.enabled ? `${selectedValid.length} selected` : "General chat"}
      </summary>
      <div className="space-y-2 mt-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.enabled}
            disabled={disabled || (!ready && !value.enabled)}
            onChange={(event) =>
              onChange({
                enabled: event.target.checked,
                document_ids: selectedValid,
              })
            }
          />{" "}
          Answer from my documents
        </label>
        {error && <p className="text-xs opacity-70">{error}</p>}
        <div className="flex gap-3 text-xs">
          <Link href="/documents" className="underline">
            Manage PDFs
          </Link>
          <button
            disabled={disabled}
            className="underline"
            onClick={() => {
              onChange({ enabled: false, document_ids: [] });
              setRevision((n) => n + 1);
            }}
          >
            Refresh sources
          </button>
        </div>
        {value.enabled && (
          <>
            <p className="text-xs opacity-70">
              Select ready PDFs. Relevant excerpts are sent to your selected
              chat provider.
            </p>
            {!documents.length && <p>No indexed PDFs are ready.</p>}
            <div className="max-h-32 overflow-y-auto space-y-1">
              {documents.map((doc) => (
                <label key={doc.id} className="flex gap-2 items-center">
                  <input
                    type="checkbox"
                    disabled={
                      disabled ||
                      (!value.document_ids.includes(doc.id) &&
                        selectedValid.length >= 20)
                    }
                    checked={value.document_ids.includes(doc.id)}
                    onChange={(event) =>
                      onChange({
                        enabled: true,
                        document_ids: event.target.checked
                          ? [...selectedValid, doc.id]
                          : selectedValid.filter((id) => id !== doc.id),
                      })
                    }
                  />
                  <span className="truncate">{doc.filename}</span>
                </label>
              ))}
            </div>
            {!selectedValid.length && (
              <p className="text-xs text-amber-700">
                Select at least one ready PDF before sending.
              </p>
            )}
          </>
        )}
      </div>
    </details>
  );
}
