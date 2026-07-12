import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { api } from "@/src/api";

const AUTH_HOST = "https://auth.emergentagent.com";
const SESSION_DATA_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data";

export function getRedirectUrl(): string {
  if (Platform.OS === "web") {
    // Must be an existing route
    return window.location.origin + "/";
  }
  return Linking.createURL("");
}

/** Extract session_id from a callback URL (hash fragment or query string). */
export function extractSessionId(url: string): string | null {
  if (!url) return null;
  try {
    // Try hash fragment first (#session_id=...)
    const hashIdx = url.indexOf("#");
    if (hashIdx >= 0) {
      const hash = url.slice(hashIdx + 1);
      const params = new URLSearchParams(hash);
      const sid = params.get("session_id");
      if (sid) return sid;
    }
    // Then query string (?session_id=...)
    const qIdx = url.indexOf("?");
    if (qIdx >= 0) {
      const params = new URLSearchParams(url.slice(qIdx + 1));
      const sid = params.get("session_id");
      if (sid) return sid;
    }
  } catch {}
  return null;
}

/** Fetch { email, name, picture, session_token } from Emergent using X-Session-ID. */
export async function fetchSessionData(sessionId: string) {
  const r = await fetch(SESSION_DATA_URL, {
    method: "GET",
    headers: { "X-Session-ID": sessionId },
  });
  if (!r.ok) {
    throw new Error(`Google session invalid (${r.status})`);
  }
  return r.json() as Promise<{ id: string; email: string; name: string; picture: string; session_token: string }>;
}

/** Exchange the session data with our backend for an app token + user. */
export async function exchangeWithBackend(session_token: string) {
  return api<{ token: string; user: any }>("/auth/google", {
    method: "POST",
    body: { session_token },
    auth: false,
  });
}

/** Start the Google sign-in flow.
 *  On web: navigates to the auth host; the return handler runs on app remount.
 *  On mobile: opens WebBrowser auth session and returns the redirect URL. */
export async function startGoogleLogin(): Promise<{ url?: string; cancelled?: boolean }> {
  const redirect = getRedirectUrl();
  const authUrl = `${AUTH_HOST}/?redirect=${encodeURIComponent(redirect)}`;

  if (Platform.OS === "web") {
    // Full-page navigation. Callback handled on remount.
    // eslint-disable-next-line no-restricted-globals
    window.location.href = authUrl;
    return {};
  }

  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirect);
  if (result.type !== "success") return { cancelled: true };
  return { url: result.url };
}
