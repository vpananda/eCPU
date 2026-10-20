import { storage } from "@/src/utils/storage";

export const getBaseUrl = () => {
  let url = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (!url || url.includes("192.168.")) {
    url = "https://ecpu.onrender.com";
  }
  return url.replace(/\/+$/, "");
};

export const BASE = getBaseUrl();
const TOKEN_KEY = "ethree_auth_token";

export async function getToken(): Promise<string | null> {
  return (await storage.secureGet(TOKEN_KEY, "")) || null;
}

export async function setToken(token: string) {
  await storage.secureSet(TOKEN_KEY, token);
}

export async function clearToken() {
  await storage.secureRemove(TOKEN_KEY);
}

/**
 * Pings the backend to check reachability and measure round-trip latency.
 */
export async function pingBackend(timeoutMs = 12000): Promise<{ ok: boolean; latency: number; error?: string }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${BASE}/api/`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timer);
    const latency = Date.now() - start;
    if (res.ok) {
      return { ok: true, latency };
    }
    return { ok: false, latency, error: `HTTP ${res.status}` };
  } catch (err: any) {
    const latency = Date.now() - start;
    if (err.name === "AbortError") {
      return { ok: false, latency, error: "Connection timed out (server might be waking up)" };
    }
    return { ok: false, latency, error: err.message || "Network request failed" };
  }
}

type ApiOpts = { method?: string; body?: any; auth?: boolean; timeoutMs?: number };

export async function api<T = any>(path: string, opts: ApiOpts = {}): Promise<T> {
  const { method = "GET", body, auth = true, timeoutMs = 30000 } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const t = await getToken();
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${BASE}/api${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timer);

    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const msg = (data && (data.detail || data.message)) || `Request failed (${res.status})`;
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    return data as T;
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      throw new Error("Request timed out. The server might be waking up or your internet connection is slow.");
    }
    throw err;
  }
}
