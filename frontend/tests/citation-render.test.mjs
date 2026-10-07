import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "./PdfPreview") return nextResolve("./PdfPreview.tsx", context);
    if (specifier === "@/lib/api") return nextResolve(new URL("../src/lib/api.ts", import.meta.url).href, context);
    if (specifier === "./chat-stream") return nextResolve("./chat-stream.ts", context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".tsx")) {
      return { format: "module", shortCircuit: true, source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
        compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
      }).outputText };
    }
    return nextLoad(url, context);
  },
});
const { CitationList } = await import("../src/components/documents/CitationList.tsx");

test("source cards render website links separately from legacy PDF preview controls", () => {
  const html = renderToStaticMarkup(React.createElement(CitationList, { citations: [
    { label: "S1", document_id: "d1", chunk_id: "c1", filename: "policy.pdf", page_start: 2, page_end: 3, excerpt: "Private excerpt" },
    { kind: "web", label: "S2", title: "Official <script>site</script>", url: "https://example.com/docs", excerpt: "<img src=x onerror=alert(1)>", retrieved_at: "2026-10-07T00:00:00Z" },
  ] }));
  assert.match(html, /PDF · policy.pdf/);
  assert.match(html, /Open source PDF at page 2/);
  assert.match(html, /Web · Official &lt;script&gt;/);
  assert.match(html, /href="https:\/\/example.com\/docs"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<script>|<img /);
});

test("source cards never make javascript URLs clickable", () => {
  const html = renderToStaticMarkup(React.createElement(CitationList, { citations: [
    { kind: "web", label: "S1", title: "Bad URL", url: "javascript:alert(1)", excerpt: "Text", retrieved_at: "2026-10-07T00:00:00Z" },
  ] }));
  assert.doesNotMatch(html, /href=|javascript:/);
});
