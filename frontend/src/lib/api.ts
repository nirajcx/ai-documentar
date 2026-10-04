import { LoginResponse, LogoutResponse, UserProfile } from "./types";

export type HealthResponse = { status: "ok" };

export function apiBaseUrl(): string {
  const url =
    typeof window === "undefined"
      ? process.env.API_INTERNAL_URL ?? "http://localhost:8000/api/v1"
      : process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
  return url.replace(/\/$/, "");
}

export async function responseError(response: Response, fallback: string): Promise<Error> {
  if ([502, 503, 504].includes(response.status)) {
    return new Error(`Service temporarily unavailable (HTTP ${response.status}). Please try again shortly.`);
  }
  if (response.status >= 500) {
    return new Error(`The server could not complete the request (HTTP ${response.status}). Please try again later.`);
  }
  if (response.status === 429) {
    return new Error("Too many requests. Please wait before trying again.");
  }
  const body = await response.json().catch(() => null);
  const detail = body?.detail ?? body?.error_description;
  if (typeof detail === "string" && detail.trim()) return new Error(detail);
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item: { msg?: unknown } | null) => item?.msg)
      .filter((message: unknown): message is string => typeof message === "string");
    if (messages.length) return new Error(messages.join("; "));
  }
  return new Error(`${fallback} (HTTP ${response.status})`);
}

export const api = {
  async register(data: { email: string; username: string; password: string }): Promise<UserProfile> {
    const res = await fetch(`${apiBaseUrl()}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw await responseError(res, "Registration could not be completed.");
    return res.json();
  },

  async login(data: { email: string; password: string }): Promise<LoginResponse> {
    const res = await fetch(`${apiBaseUrl()}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw await responseError(
        res,
        res.status === 401 ? "Invalid email or password." : "Sign-in could not be completed."
      );
    }
    return res.json();
  },

  async logout(): Promise<LogoutResponse> {
    const res = await fetch(`${apiBaseUrl()}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) throw await responseError(res, "Failed to logout.");
    return res.json();
  },

  async getMe(): Promise<UserProfile> {
    const res = await fetch(`${apiBaseUrl()}/auth/me`, {
      method: "GET",
      credentials: "include",
    });
    if (!res.ok) throw await responseError(res, "Session expired or invalid.");
    return res.json();
  },

  async getHealth(signal?: AbortSignal): Promise<HealthResponse> {
    const res = await fetch(`${apiBaseUrl()}/health`, { signal, cache: "no-store" });
    if (!res.ok) throw new Error(`API request failed: ${res.status}`);
    return res.json() as Promise<HealthResponse>;
  },
};
