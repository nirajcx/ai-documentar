export interface UserProfile {
  id: string;
  email: string;
  username: string;
  is_active: boolean;
  created_at: string;
}

export interface LoginResponse {
  session_token: string;
  user: UserProfile;
  expires_at: string;
}

export interface LogoutResponse {
  message: string;
}

export interface ChatMessage {
  id?: string;
  role: "system" | "user" | "assistant";
  content: string;
  created_at?: string;
}

export interface ChatResponse {
  message: ChatMessage;
  model: string;
  done: boolean;
  total_duration?: number;
}

export type ChatProvider = "groq" | "ollama";

export interface ChatModelsResponse {
  provider: ChatProvider;
  default_model: string;
  configured: boolean;
  models: { name: string }[];
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface SavedChatMessage extends ChatMessage {
  citations?: Citation[];
  id: string;
  role: "user" | "assistant";
  status: "streaming" | "complete" | "interrupted" | "error";
  position: number;
  request_id: string;
}

export interface ConversationDetail extends Conversation {
  messages: SavedChatMessage[];
}

export type DocumentStatus = "queued" | "parsing" | "chunking" | "embedding" | "ready" | "needs_ocr" | "failed";
export interface KnowledgeDocument {
  id: string;
  filename: string;
  size_bytes: number;
  status: DocumentStatus;
  page_count: number | null;
  chunk_count: number;
  progress: number | null;
  error: string | null;
  created_at: string;
}
export interface DocumentCitation {
  kind?: "document";
  label: string;
  document_id: string;
  chunk_id: string;
  filename: string;
  page_start: number;
  page_end: number;
  excerpt: string;
}
export interface RagOptions {
  enabled: boolean;
  document_ids: string[];
}

export interface WebCitation {
  kind: "web";
  label: string;
  title: string;
  url: string;
  excerpt: string;
  retrieved_at: string;
}
export type Citation = DocumentCitation | WebCitation;
export interface WebSearchOptions {
  enabled: boolean;
  query?: string;
}
