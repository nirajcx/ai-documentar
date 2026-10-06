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
  Plus,
  RefreshCw,
  Square,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { api } from "@/lib/api";
import { RagControls } from "@/components/documents/RagControls";
import { CitationList } from "@/components/documents/CitationList";
import { ChatProvider, RagOptions } from "@/lib/types";
import { useConversations } from "@/hooks/useConversations";
import { useAuthStore } from "@/stores/useAuthStore";

export default function ChatPage() {
  const userId = useAuthStore(state => state.user?.id);
  return <ProtectedRoute><ChatWorkspace key={userId ?? "signed-out"} /></ProtectedRoute>;
}

function ChatWorkspace() {
  const chat = useConversations();
  const { messages, busy, streaming } = chat;
  const [input, setInput] = useState("");
  const [rag, setRag] = useState<RagOptions>({ enabled: false, document_ids: [] });

  const [models, setModels] = useState<{ name: string }[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [provider, setProvider] = useState<ChatProvider>("groq");
  const [requestedProvider, setRequestedProvider] = useState<ChatProvider>();
  const [providerReady, setProviderReady] = useState(false);
  const [providerError, setProviderError] = useState("");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);


  // Auto-scroll as words stream in
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  // Initially use the server's configured default; users may explicitly switch providers.
  useEffect(() => {
    let active = true;
    async function loadModels() {
      setProviderReady(false);
      setProviderError("");
      setModels([]);
      setSelectedModel("");
      try {
        const result = await api.getModels(requestedProvider);
        if (!active) return;
        setProvider(result.provider);
        setModels(result.models);
        const model = result.models.find((m) => m.name === result.default_model)
          ?? result.models[0];
        setSelectedModel(model?.name ?? "");
        setProviderReady(result.configured && Boolean(model));
        if (!result.configured) setProviderError("Set GROQ_API_KEY in the backend environment, restart the API, and reload this page.");
        else if (!model) setProviderError("No chat models are available for this provider.");
      } catch (err) {
        if (active) setProviderError(err instanceof Error ? err.message : "Could not load chat models.");
      }
    }
    void loadModels();
    return () => { active = false; };
  }, [requestedProvider]);

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    if (!input.trim() || busy || !providerReady || !chat.historyReady || (rag.enabled && !rag.document_ids.length)) return;
    const text = input.trim();
    setInput("");
    const submitted = await chat.send(text, provider, selectedModel, rag);
    if (!submitted) setInput(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  function copyToClipboard(text: string, idx: number) {
    void navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  return (
    <div className="flex flex-col flex-1 h-full max-w-4xl mx-auto w-full min-h-0">
      {/* Chat Top Bar */}
      <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-[#e8dfd3] dark:border-[#322b22] shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="max-w-full truncate text-xl font-bold tracking-tight text-[#2a241e] dark:text-[#f3eee7]">
                {chat.conversations.find(item => item.id === chat.activeId)?.title ?? "New chat"}
              </h1>
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-[#f7f0e3] dark:bg-[#2b2216] text-[#96743d] dark:text-[#d4af6a] border border-[#e8dfd3] dark:border-[#3a2e1d]">
                <Cpu className="w-3.5 h-3.5" />
                <select
                  aria-label="Chat provider"
                  value={requestedProvider ?? provider}
                  disabled={busy}
                  onChange={(e) => {
                    setProviderReady(false);
                    setRequestedProvider(e.target.value as ChatProvider);
                  }}
                  className="bg-transparent text-xs cursor-pointer"
                >
                  <option value="groq" className="dark:bg-[#1c1916]">Groq</option>
                  <option value="ollama" className="dark:bg-[#1c1916]">Ollama</option>
                </select>
                <select
                  aria-label="Chat model"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={busy}
                  className="max-w-40 sm:max-w-64 bg-transparent border-none text-xs font-medium focus:outline-none cursor-pointer"
                >
                  {models.length > 0 ? (
                    models.map((m) => (
                      <option key={m.name} value={m.name} className="dark:bg-[#1c1916]">
                        {m.name}
                      </option>
                    ))
                  ) : (
                    <option value="">No model available</option>
                  )}
                </select>
              </div>
            </div>
            <p className="text-xs text-[#827566] dark:text-[#a89b8c] mt-0.5">
              Live token streaming · {provider === "ollama" ? "Local Ollama" : "Groq cloud"}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                chat.newConversation();
                setInput("");
              }}
              aria-label="Start new chat"
              className="h-8 px-2.5 text-xs gap-1.5 border-[#e8dfd3] dark:border-[#382f25] text-[#5e5141] dark:text-[#c4b5a3] hover:bg-[#ede3d4] dark:hover:bg-[#252019] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New chat</span>
            </Button>
            {chat.activeId && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void chat.openConversation(chat.activeId!)}
                aria-label="Reload current conversation"
                className="h-8 w-8 p-0 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {providerError && <p role="alert" className="py-3 text-sm text-red-600">{providerError}</p>}

        {chat.error && <p role="alert" className="py-2 text-sm text-red-600">{chat.error}</p>}
        {busy && !streaming && <p role="status" className="py-2 text-sm">Loading conversation…</p>}
        {messages.some(message => message.status === "streaming") && !busy && <p role="status" className="py-2 text-sm">An answer is still being saved or generated. Reload to check its status.</p>}

        <RagControls value={rag} onChange={setRag} disabled={busy} />

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
                {provider === "ollama" ? "Messages are sent to your configured Ollama server." : "Messages are sent to Groq for cloud generation."} Responses support streaming and Markdown.
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
                key={m.id}
                className={`flex gap-3.5 group ${m.role === "user" ? "justify-end" : "justify-start"
                  }`}
              >
                {m.role === "assistant" && (
                  <div className="w-8 h-8 rounded-xl bg-[#f7f0e3] dark:bg-[#2b2216] text-[#96743d] dark:text-[#d4af6a] flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`relative max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-xs ${m.role === "user"
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
                          <span>{m.status === "streaming" ? "Generating answer…" : "No answer was generated."}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    m.content
                  )}

                  {m.role === "assistant" && ["error", "interrupted"].includes(m.status) && <p className="mt-2 text-xs text-amber-700">{m.status === "interrupted" ? "Generation stopped" : "Generation failed"} · partial answer</p>}

                  {m.role === "assistant" && Boolean(m.citations?.length) && <CitationList citations={m.citations!} />}

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
            disabled={busy}
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
                  onClick={chat.stop}
                  className="bg-[#2a241e] hover:bg-black text-white gap-1.5 px-3.5 h-8 text-xs rounded-lg cursor-pointer"
                >
                  <Square className="w-3 h-3 fill-white" />
                  <span>Stop</span>
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={!input.trim() || busy || !providerReady || !chat.historyReady || (rag.enabled && !rag.document_ids.length) || messages.some(message => message.status === "streaming")}
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
  );
}
