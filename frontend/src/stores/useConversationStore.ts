"use client";

import { create } from "zustand";
import { api } from "@/lib/api";
import type { RagOptions, WebSearchOptions, ChatProvider, Conversation, SavedChatMessage } from "@/lib/types";

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Request failed.";

function rememberConversation(id: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (id) {
    url.searchParams.set("conversation", id);
  } else {
    url.searchParams.delete("conversation");
  }
  window.history.replaceState(null, "", url);
}

interface ConversationState {
  conversations: Conversation[];
  activeId: string | null;
  messages: SavedChatMessage[];
  listLoading: boolean;
  listError: string;
  error: string;
  busy: boolean;
  streaming: boolean;
  historyReady: boolean;

  refreshList: () => Promise<void>;
  openConversation: (id: string) => Promise<void>;
  newConversation: () => void;
  send: (message: string, provider: ChatProvider, model: string, rag?: RagOptions, webSearch?: WebSearchOptions) => Promise<boolean>;
  stop: () => void;
  reset: () => void;
  initialize: () => void;
}

let locked = false;
let abortController: AbortController | null = null;
let listRequestVersion = 0;
let initialized = false;

export const useConversationStore = create<ConversationState>((set, get) => ({
  conversations: [],
  activeId: null,
  messages: [],
  listLoading: false,
  listError: "",
  error: "",
  busy: false,
  streaming: false,
  historyReady: true,

  initialize: () => {
    if (initialized) return;
    initialized = true;

    void get().refreshList();

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const id = url.searchParams.get("conversation");
      if (id) {
        void get().openConversation(id);
      }
    }
  },

  refreshList: async () => {
    const version = ++listRequestVersion;
    set({ listLoading: true, listError: "" });
    try {
      const items = await api.listConversations();
      if (version === listRequestVersion) {
        set({ conversations: items });
      }
    } catch (err) {
      if (version === listRequestVersion) {
        set({ listError: errorText(err) });
      }
    } finally {
      if (version === listRequestVersion) {
        set({ listLoading: false });
      }
    }
  },

  openConversation: async (id: string) => {
    if (locked) return;
    locked = true;

    if (abortController) {
      abortController.abort();
    }
    const abort = new AbortController();
    abortController = abort;

    set({
      busy: true,
      error: "",
      historyReady: false,
      messages: [],
      activeId: id,
    });
    rememberConversation(id);

    try {
      const detail = await api.getConversation(id, abort.signal);
      if (abort.signal.aborted) return;
      set({ messages: detail.messages, historyReady: true });
    } catch (err) {
      if (!abort.signal.aborted) {
        set({ error: errorText(err) });
      }
    } finally {
      set({ busy: false });
      locked = false;
      abortController = null;
    }
  },

  newConversation: () => {
    if (locked) return;
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    set({
      activeId: null,
      messages: [],
      error: "",
      historyReady: true,
    });
    rememberConversation(null);
  },

  send: async (message: string, provider: ChatProvider, model: string, rag?: RagOptions, webSearch?: WebSearchOptions): Promise<boolean> => {
    const state = get();
    if (
      locked ||
      !state.historyReady ||
      state.messages.some((item) => item.status === "streaming") ||
      !message.trim()
    ) {
      return false;
    }

    locked = true;
    set({ busy: true, error: "" });
    const abort = new AbortController();
    abortController = abort;

    let id = state.activeId;
    let submitted = false;
    const requestId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();

    try {
      if (!id) {
        const created = await api.createConversation(
          message.trim().slice(0, 120),
          abort.signal
        );
        if (abort.signal.aborted) return false;
        id = created.id;
        set((s) => ({
          activeId: id,
          conversations: [created, ...s.conversations.filter((c) => c.id !== created.id)],
        }));
        rememberConversation(id);
      }

      const now = new Date().toISOString();
      set((s) => ({
        messages: [
          ...s.messages,
          {
            id: requestId,
            request_id: requestId,
            role: "user",
            content: message,
            status: "complete",
            position: s.messages.length + 1,
            created_at: now,
          },
          {
            id: assistantId,
            request_id: requestId,
            role: "assistant",
            content: "",
            status: "streaming",
            position: s.messages.length + 2,
            created_at: now,
          },
        ],
        streaming: true,
      }));
      submitted = true;

      await api.streamConversation(
        id,
        { message, request_id: requestId, provider, model, ...(rag?.enabled ? { rag } : {}), ...(webSearch?.enabled ? { web_search: webSearch } : {}) },
        (token) => {
          if (!abort.signal.aborted) {
            set((s) => ({
              messages: s.messages.map((item) =>
                item.id === assistantId ? { ...item, content: item.content + token } : item
              ),
            }));
          }
        },
        abort.signal,
        (citations) => {
          if (!abort.signal.aborted) set(s => ({ messages: s.messages.map(item =>
            item.id === assistantId ? { ...item, citations } : item) }));
        },
      );

      set((s) => ({
        messages: s.messages.map((item) =>
          item.id === assistantId ? { ...item, status: "complete" } : item
        ),
      }));
    } catch (err) {
      set((s) => ({
        error: abort.signal.aborted
          ? "Generation stopped. Reload this conversation to check the saved answer."
          : errorText(err),
        messages: s.messages.map((item) =>
          item.id === assistantId
            ? { ...item, status: abort.signal.aborted ? "interrupted" : "error" }
            : item
        ),
      }));
    } finally {
      if (id && submitted && !abort.signal.aborted) {
        try {
          const detail = await api.getConversation(id, abort.signal);
          if (!abort.signal.aborted) {
            set({ messages: detail.messages, historyReady: true });
          }
        } catch {
          set({
            historyReady: false,
            error:
              "Could not confirm saved history. Reload the conversation before sending again.",
          });
        }
      }

      if (abort.signal.aborted && submitted) {
        set({ historyReady: false });
      }

      set({ busy: false, streaming: false });
      void get().refreshList();
      locked = false;
      abortController = null;
    }

    return submitted;
  },

  stop: () => {
    if (abortController) {
      abortController.abort();
    }
  },

  reset: () => {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    initialized = false;
    locked = false;
    set({
      conversations: [],
      activeId: null,
      messages: [],
      listLoading: false,
      listError: "",
      error: "",
      busy: false,
      streaming: false,
      historyReady: true,
    });
  },
}));
