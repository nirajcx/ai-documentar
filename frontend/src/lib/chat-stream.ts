/** Consume complete SSE frames; a network read is not necessarily a whole event. */
export async function readChatStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (token: string) => void,
  onDone: () => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const payload = frame.split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).replace(/^ /, ""))
          .join("\n");
        if (!payload) continue;
        const event = JSON.parse(payload) as { content?: string; done?: boolean; error?: string };
        if (event.error) throw new Error(event.error);
        if (event.content) onChunk(event.content);
        if (event.done) {
          onDone();
          return;
        }
      }
      if (done) throw new Error("The response stream ended before the answer was complete.");
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
