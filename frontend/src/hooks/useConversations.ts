"use client";

import { useEffect } from "react";
import { useConversationStore } from "@/stores/useConversationStore";

export function useConversations() {
  const store = useConversationStore();

  useEffect(() => {
    store.initialize();
  }, [store]);

  return store;
}

export { useConversationStore };
