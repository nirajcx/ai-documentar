import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier === "./chat-stream" && context.parentURL?.endsWith("/api.ts") ? "./chat-stream.ts" : specifier, context);
} });
const { api } = await import("../src/lib/api.ts");
const { pdfValidationError, MAX_PDF_BYTES, indexing } = await import("../src/lib/documents.ts");
const { readChatStream } = await import("../src/lib/chat-stream.ts");

test("PDF queue rejects empty, oversized and non-PDF files", () => {
  assert.equal(pdfValidationError({ name: "REPORT.PDF", size: 1 }), null);
  assert.equal(pdfValidationError({ name: "report.pdf", size: MAX_PDF_BYTES }), null);
  assert.ok(pdfValidationError({ name: "report.pdf", size: MAX_PDF_BYTES + 1 }));
  assert.ok(pdfValidationError({ name: "report.pdf", size: 0 }));
  assert.ok(pdfValidationError({ name: "report.exe", size: 10 }));
  assert.equal(indexing("embedding"), true);
  assert.equal(indexing("needs_ocr"), false);
  assert.equal(indexing("failed"), false);
});

test("upload uses authenticated multipart and lets browser choose boundary", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.ok(url.endsWith("/documents"));
    assert.equal(options.method, "POST");
    assert.equal(options.credentials, "include");
    assert.equal(options.headers, undefined);
    assert.ok(options.body instanceof FormData);
    assert.equal(options.body.get("file").name, "notes.pdf");
    return Response.json({ id: "document-1", status: "queued" }, { status: 202 });
  };
  try { assert.equal((await api.uploadDocument(new File(["%PDF-"], "notes.pdf", { type: "application/pdf" }))).status, "queued"); }
  finally { globalThis.fetch = original; }
});

test("list, capabilities, retry, delete and PDF preview have correct contracts", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options });
    assert.equal(options.credentials, "include");
    if (url.endsWith("/file")) return new Response("%PDF-", { headers: { "Content-Type": "application/pdf" } });
    if (options.method === "DELETE") return new Response(null, { status: 204 });
    return Response.json(url.endsWith("/capabilities") ? { chat_ready: false } : []);
  };
  try {
    await api.listDocuments();
    assert.equal((await api.documentCapabilities()).chat_ready, false);
    await api.retryDocument("doc-1");
    await api.deleteDocument("doc-1");
    assert.equal((await api.documentFile("doc-1")).type, "application/pdf");
    assert.ok(calls[2].url.endsWith("/documents/doc-1/retry"));
    assert.equal(calls[2].method, "POST");
    assert.equal(calls[3].method, "DELETE");
    assert.equal(calls[0].cache, "no-store");
  } finally { globalThis.fetch = original; }
});

test("PDF preview rejects HTML responses and protected/deleted files", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("html", { headers: { "Content-Type": "text/html" } });
    await assert.rejects(api.documentFile("1"), /did not return a PDF/);
    globalThis.fetch = async () => Response.json({ detail: "Document not found" }, { status: 404 });
    await assert.rejects(api.documentFile("1"), /Document not found/);
  } finally { globalThis.fetch = original; }
});

test("RAG stream passes selected IDs and receives citations before completion", async () => {
  const original = globalThis.fetch;
  const citations = [{ label: "S1", document_id: "doc-1", chunk_id: "chunk-1", filename: "notes.pdf", page_start: 3, page_end: 3, excerpt: "Source passage" }];
  globalThis.fetch = async (url, options) => {
    assert.deepEqual(JSON.parse(options.body).rag, { enabled: true, document_ids: ["doc-1"] });
    return new Response(`data: {"content":"Answer [S1]"}\n\ndata: ${JSON.stringify({ citations })}\n\ndata: {"done":true}\n\n`);
  };
  try {
    let received;
    await api.streamConversation("chat-1", { message: "question", request_id: "r1", provider: "groq", model: "test", rag: { enabled: true, document_ids: ["doc-1"] } }, () => undefined, undefined, sources => { received = sources; });
    assert.deepEqual(received, citations);
  } finally { globalThis.fetch = original; }
});

test("citations alone do not count as successful answer completion", async () => {
  const events = [];
  const body = new Response('data: {"citations":[]}\n\ndata: {"error":"Invalid citations"}\n\n').body;
  await assert.rejects(readChatStream(body, () => undefined, () => events.push("done"), () => events.push("citations")), /Invalid citations/);
  assert.deepEqual(events, ["citations"]);
});

test("web capabilities are authenticated and never require a browser API key", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.ok(url.endsWith("/conversations/capabilities"));
    assert.equal(options.credentials, "include");
    assert.equal(options.cache, "no-store");
    return Response.json({ web_search_ready: true, web_search_provider: "tavily" });
  };
  try { assert.equal((await api.conversationCapabilities()).web_search_ready, true); }
  finally { globalThis.fetch = original; }
});

test("web plus PDF request carries options and mixed citations survive stream and history", async () => {
  const original = globalThis.fetch;
  const citations = [
    { label: "S1", document_id: "doc-1", chunk_id: "chunk-1", filename: "notes.pdf", page_start: 1, page_end: 1, excerpt: "Private passage" },
    { kind: "web", label: "S2", title: "Official site", url: "https://example.com", excerpt: "Public passage", retrieved_at: "2026-10-07T00:00:00Z" },
  ];
  globalThis.fetch = async (url, options) => {
    if (options.method === "POST") {
      const data = JSON.parse(options.body);
      assert.deepEqual(data.web_search, { enabled: true, query: "public question" });
      assert.deepEqual(data.rag, { enabled: true, document_ids: ["doc-1"] });
      assert.equal(options.credentials, "include");
      return new Response(`data: {"content":"Answer [S1] [S2]"}\n\ndata: ${JSON.stringify({ citations })}\n\ndata: {"done":true}\n\n`);
    }
    return Response.json({ id: "chat-1", messages: [{ content: "Answer [S1] [S2]", citations }] });
  };
  try {
    let received;
    await api.streamConversation("chat-1", {
      message: "compare", request_id: "r1", provider: "groq", model: "test",
      rag: { enabled: true, document_ids: ["doc-1"] }, web_search: { enabled: true, query: "public question" },
    }, () => undefined, undefined, values => { received = values; });
    assert.deepEqual(received, citations);
    assert.deepEqual((await api.getConversation("chat-1")).messages[0].citations, citations);
  } finally { globalThis.fetch = original; }
});
