"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Send,
  Sparkles,
  Bot,
  User,
  Loader2,
  Cpu,
  Trash2,
  Square,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { api } from "@/lib/api";
import { ChatMessage } from "@/lib/types";
import { notify } from "@/stores/useToastStore";

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [models, setModels] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState("llama3.1:8b");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-scroll as words stream in
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  // Load available Ollama models
  useEffect(() => {
    async function loadModels() {
      try {
        const fetched = await api.getModels();
        setModels(fetched);
        if (fetched.length > 0) {
          const hasLlama = fetched.some((m: any) => m.name.includes("llama3.1"));
          if (!hasLlama) {
            setSelectedModel(fetched[0].name);
          }
        }
      } catch (err) {
        console.warn("Could not load Ollama models list:", err);
      }
    }
    void loadModels();
  }, []);

  async function handleSend(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!input.trim() || streaming) return;

    const userText = input.trim();
    setInput("");

    // Create current history with new user message
    const userMsg: ChatMessage = { role: "user", content: userText };
    const historyWithUser = [...messages, userMsg];

    // Placeholder assistant message to stream words into
    const assistantPlaceholder: ChatMessage = { role: "assistant", content: "" };
    setMessages([...historyWithUser, assistantPlaceholder]);

    setLoading(true);
    setStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await api.streamMessage(
        historyWithUser,
        selectedModel,
        (token: string) => {
          setLoading(false); // First token arrived, stop spinner
          setMessages((prev) => {
            const updated = [...prev];
            const lastIndex = updated.length - 1;
            if (lastIndex >= 0 && updated[lastIndex].role === "assistant") {
              updated[lastIndex] = {
                ...updated[lastIndex],
                content: updated[lastIndex].content + token,
              };
            }
            return updated;
          });
        },
        () => {
          setStreaming(false);
          setLoading(false);
        },
        controller.signal
      );
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        // User voluntarily stopped generation
        setStreaming(false);
        setLoading(false);
        return;
      }
      const msg = err instanceof Error ? err.message : "Streaming failed";
      notify(msg, "error");
      setMessages((prev) => {
        const updated = [...prev];
        const lastIndex = updated.length - 1;
        if (lastIndex >= 0 && updated[lastIndex].role === "assistant") {
          updated[lastIndex] = {
            ...updated[lastIndex],
            content:
              updated[lastIndex].content ||
              `⚠️ Error connecting to Ollama (${selectedModel}): ${msg}. Please check that Ollama is running on your Mac.`,
          };
        }
        return updated;
      });
    } finally {
      setStreaming(false);
      setLoading(false);
      abortControllerRef.current = null;
    }
  }

  function handleStop() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setStreaming(false);
      setLoading(false);
      notify("Generation stopped.", "info");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  function clearChat() {
    if (streaming) handleStop();
    setMessages([]);
    notify("Conversation cleared.", "info");
  }

  function copyToClipboard(text: string, idx: number) {
    void navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  return (
    <ProtectedRoute>
      <div className="flex flex-col h-[calc(100vh-6rem)] max-w-4xl mx-auto">
        {/* Chat Top Bar */}
        <div className="flex items-center justify-between pb-4 border-b border-[#e8dfd3] dark:border-[#322b22]">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-[#2a241e] dark:text-[#f3eee7]">
                AI Chat
              </h1>
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-[#f7f0e3] dark:bg-[#2b2216] text-[#96743d] dark:text-[#d4af6a] border border-[#e8dfd3] dark:border-[#3a2e1d]">
                <Cpu className="w-3.5 h-3.5" />
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={streaming}
                  className="bg-transparent border-none text-xs font-medium focus:outline-none cursor-pointer"
                >
                  {models.length > 0 ? (
                    models.map((m: any) => (
                      <option key={m.name} value={m.name} className="dark:bg-[#1c1916]">
                        {m.name}
                      </option>
                    ))
                  ) : (
                    <option value="llama3.1:8b">llama3.1:8b</option>
                  )}
                </select>
              </div>
            </div>
            <p className="text-xs text-[#827566] dark:text-[#a89b8c] mt-0.5">
              Live token streaming · Ollama on MacBook (192.168.1.4:11434)
            </p>
          </div>

          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearChat}
              className="text-[#827566] hover:text-red-600 gap-1.5 text-xs cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </Button>
          )}
        </div>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto py-6 space-y-6 pr-2">
          {messages.length === 0 ? (
            <section className="flex min-h-[50vh] flex-col items-center justify-center text-center p-8 border border-dashed border-[#e0d6c7] dark:border-[#322b22] rounded-2xl bg-white/40 dark:bg-[#181512]/40">
              <div className="w-14 h-14 rounded-2xl bg-[#f7f0e3] dark:bg-[#2b2216] text-[#96743d] dark:text-[#d4af6a] flex items-center justify-center mb-4 shadow-sm">
                <Bot className="w-7 h-7" />
              </div>
              <h2 className="text-lg font-semibold text-[#2a241e] dark:text-[#f3eee7]">
                How can I help you today?
              </h2>
              <p className="mt-2 max-w-md text-xs text-[#827566] dark:text-[#a89b8c] leading-relaxed">
                Your local Ollama model (<strong>{selectedModel}</strong>) is connected with real-time streaming tokens and markdown formatting.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-6 max-w-lg w-full">
                <button
                  onClick={() => {
                    setInput("Explain how RAG (Retrieval-Augmented Generation) works with vector databases.");
                  }}
                  className="p-3 text-left rounded-xl border border-[#e8dfd3] dark:border-[#322b22] bg-white dark:bg-[#1a1714] hover:border-[#c49d58] text-xs transition cursor-pointer shadow-xs"
                >
                  <p className="font-semibold text-[#2a241e] dark:text-[#f3eee7]">Explain RAG Architecture</p>
                  <p className="text-[11px] text-[#827566] truncate mt-0.5">Chunks, embeddings & vector retrieval</p>
                </button>
                <button
                  onClick={() => {
                    setInput("Write a Python FastAPI snippet demonstrating how to stream responses with Server-Sent Events (SSE).");
                  }}
                  className="p-3 text-left rounded-xl border border-[#e8dfd3] dark:border-[#322b22] bg-white dark:bg-[#1a1714] hover:border-[#c49d58] text-xs transition cursor-pointer shadow-xs"
                >
                  <p className="font-semibold text-[#2a241e] dark:text-[#f3eee7]">Python SSE Streaming</p>
                  <p className="text-[11px] text-[#827566] truncate mt-0.5">FastAPI StreamingResponse example</p>
                </button>
              </div>
            </section>
          ) : (
            messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex gap-3.5 group ${
                  m.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {m.role === "assistant" && (
                  <div className="w-8 h-8 rounded-xl bg-[#f7f0e3] dark:bg-[#2b2216] text-[#96743d] dark:text-[#d4af6a] flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`relative max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-xs ${
                    m.role === "user"
                      ? "bg-[#96743d] text-white rounded-br-xs whitespace-pre-wrap"
                      : "bg-white dark:bg-[#1a1714] border border-[#e8dfd3] dark:border-[#322b22] text-[#2a241e] dark:text-[#f3eee7] rounded-bl-xs"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <div className="markdown-content">
                      {m.content ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {m.content}
                        </ReactMarkdown>
                      ) : (
                        <div className="flex items-center gap-2 text-[#827566] py-1 text-xs">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#96743d]" />
                          <span>Generating answer…</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    m.content
                  )}

                  {/* Copy button for assistant responses */}
                  {m.role === "assistant" && m.content && (
                    <button
                      onClick={() => copyToClipboard(m.content, idx)}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md text-[#827566] hover:text-[#2a241e] dark:hover:text-white bg-white/80 dark:bg-[#1a1714]/80 backdrop-blur-xs cursor-pointer"
                      title="Copy response"
                    >
                      {copiedIdx === idx ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>

                {m.role === "user" && (
                  <div className="w-8 h-8 rounded-xl bg-[#ede3d4] dark:bg-[#2e261c] text-[#7a5d30] dark:text-[#d4af6a] flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input & Streaming Controls */}
        <form
          onSubmit={handleSend}
          className="mt-2 rounded-2xl border border-[#e8dfd3] dark:border-[#322b22] bg-white dark:bg-[#1a1714] p-3 shadow-md relative"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              streaming
                ? "Wait for response to finish or click Stop…"
                : `Message ${selectedModel}… (Enter to send, Shift+Enter for newline)`
            }
            className="min-h-[55px] max-h-32 resize-none border-none shadow-none focus-visible:ring-0 p-1 text-sm bg-transparent"
          />
          <div className="flex items-center justify-between pt-2 border-t border-[#f4ede2] dark:border-[#252019]">
            <div className="flex items-center gap-1.5 text-[11px] text-[#827566]">
              <Sparkles className="w-3.5 h-3.5 text-[#96743d]" />
              <span>Real-Time SSE Streaming</span>
            </div>

            <div className="flex items-center gap-2">
              {streaming ? (
                <Button
                  type="button"
                  onClick={handleStop}
                  className="bg-[#2a241e] hover:bg-black text-white gap-1.5 px-3.5 h-8 text-xs rounded-lg cursor-pointer"
                >
                  <Square className="w-3 h-3 fill-white" />
                  <span>Stop</span>
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="bg-[#96743d] hover:bg-[#83632f] disabled:opacity-40 text-white gap-1.5 px-4 h-8 text-xs rounded-lg cursor-pointer shadow-xs"
                >
                  <span>Send</span>
                  <Send className="w-3 h-3" />
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </ProtectedRoute>
  );
}
