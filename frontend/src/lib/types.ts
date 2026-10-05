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
