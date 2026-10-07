"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { WebSearchOptions } from "@/lib/types";

export function WebSearchControls({ value, onChange, disabled }: {
  value: WebSearchOptions;
  onChange: (value: WebSearchOptions) => void;
  disabled: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("Checking web search availability…");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api.conversationCapabilities(controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setReady(result.web_search_ready);
      setMessage(result.web_search_ready ? "" : "Web search is not configured. Ask your administrator to enable it.");
    }).catch(() => {
      if (!controller.signal.aborted) {
        setReady(false);
        setMessage("Could not check web search availability.");
      }
    });
    return () => controller.abort();
  }, [revision]);

  return <div className="border rounded-lg p-3 text-sm mb-3 shrink-0 space-y-2">
    <label className="flex items-center gap-2 font-medium">
      <input type="checkbox" checked={value.enabled}
        disabled={disabled || (!ready && !value.enabled)}
        onChange={event => onChange({ ...value, enabled: event.target.checked })} />
      Search the web
    </label>
    {message && <p className="text-xs opacity-70">{message} <button type="button" disabled={disabled}
      className="underline" onClick={() => setRevision(r => r + 1)}>Check again</button></p>}
    {value.enabled && <>
      <p className="text-xs opacity-70">Your question is sent to Tavily to find web sources. PDF text and chat history are not sent to search. You can use PDFs and web sources together.</p>
      <label className="block text-xs">
        Search query (optional; use for private, long, or follow-up questions)
        <input value={value.query ?? ""} disabled={disabled} maxLength={400}
          className="block mt-1 w-full rounded border bg-transparent p-2"
          placeholder="Leave blank to search your current question"
          onChange={event => onChange({ ...value, query: event.target.value.trim() ? event.target.value : undefined })} />
      </label>
      <p className="text-xs opacity-70">Answers appear after source-label checks. A citation is not a guarantee that a claim is correct.</p>
    </>}
  </div>;
}
