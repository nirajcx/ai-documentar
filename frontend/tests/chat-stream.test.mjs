import assert from "node:assert/strict";
import test from "node:test";
import { readChatStream } from "../src/lib/chat-stream.ts";

function stream(bytes) {
  return new ReadableStream({
    start(controller) {
      for (const value of bytes) controller.enqueue(value);
      controller.close();
    },
  });
}
const encoder = new TextEncoder();

test("handles split UTF-8, CRLF frames and completes exactly once", async () => {
  const bytes = encoder.encode(': ping\r\ndata: {"content":"Hello 🌍"}\r\n\r\ndata: {"done":true}\r\n\r\n');
  let content = "";
  let completed = 0;
  await readChatStream(stream([...bytes].map((b) => new Uint8Array([b]))),
    (token) => { content += token; }, () => { completed++; });
  assert.equal(content, "Hello 🌍");
  assert.equal(completed, 1);
});

test("propagates errors after partial tokens instead of reporting success", async () => {
  let content = "";
  await assert.rejects(readChatStream(stream([
    encoder.encode('data: {"content":"Partial"}\n\ndata: {"error":"Rate limited"}\n\n'),
  ]), (token) => { content += token; }, () => assert.fail("must not complete")), /Rate limited/);
  assert.equal(content, "Partial");
});

test("rejects truncated responses without a completion event", async () => {
  await assert.rejects(readChatStream(stream([encoder.encode('data: {"content":"part"}\n\n')]),
    () => {}, () => assert.fail("must not complete")), /before the answer was complete/);
});

test("propagates aborts and releases the stream reader", async () => {
  const body = new ReadableStream({ start(controller) {
    controller.error(new DOMException("Aborted", "AbortError"));
  } });
  await assert.rejects(readChatStream(body, () => {}, () => {}), { name: "AbortError" });
  assert.equal(body.locked, false);
});
