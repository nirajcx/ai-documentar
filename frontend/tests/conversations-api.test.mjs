import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "./chat-stream" && context.parentURL?.endsWith("/api.ts")) {
      return nextResolve("./chat-stream.ts", context);
    }
    return nextResolve(specifier, context);
  },
});
const { api } = await import("../src/lib/api.ts");

test("conversation list, creation and detail use authenticated persistence endpoints", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options });
    return Response.json(options.method === "POST" ? { id: "chat-1" } : []);
  };
  try {
    await api.listConversations();
    await api.createConversation("My conversation");
    await api.getConversation("chat-1");
    assert.ok(calls[0].url.endsWith("/conversations"));
    assert.equal(calls[0].cache, "no-store");
    assert.equal(calls[1].method, "POST");
    assert.deepEqual(JSON.parse(calls[1].body), { title: "My conversation" });
    assert.ok(calls[2].url.endsWith("/conversations/chat-1"));
    assert.ok(calls.every(call => call.credentials === "include"));
  } finally { globalThis.fetch = original; }
});

test("stream sends only the new turn and request ID and consumes saved completion", async () => {
  const original = globalThis.fetch;
  const data = { message: "Hello", request_id: "request-1", provider: "groq", model: "test-model" };
  const controller = new AbortController();
  globalThis.fetch = async (url, options) => {
    assert.ok(url.endsWith("/conversations/chat-1/messages/stream"));
    assert.deepEqual(JSON.parse(options.body), data);
    assert.equal(options.signal, controller.signal);
    assert.equal(options.credentials, "include");
    return new Response('data: {"content":"Hello"}\n\ndata: {"done":true}\n\n');
  };
  try {
    let answer = "";
    await api.streamConversation("chat-1", data, token => { answer += token; }, controller.signal);
    assert.equal(answer, "Hello");
  } finally { globalThis.fetch = original; }
});

test("missing backend endpoints surface errors rather than fake saved history", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ detail: "Not Found" }, { status: 404 });
  try { await assert.rejects(api.listConversations(), /Not Found/); }
  finally { globalThis.fetch = original; }
});

test("failed database finalization is not treated as a successful generation", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('data: {"content":"Partial"}\n\ndata: {"error":"Could not save answer"}\n\n');
  try {
    await assert.rejects(api.streamConversation("chat-1", {
      message: "Hello", request_id: "request-1", provider: "groq", model: "test-model",
    }, () => undefined), /Could not save answer/);
  } finally { globalThis.fetch = original; }
});
