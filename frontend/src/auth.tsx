import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import { api, setToken, clearToken, getToken } from "@/src/api";
import { startGoogleLogin, fetchSessionData, exchangeWithBackend, extractSessionId } from "@/src/google-auth";

type User = {
  id: string;
  name: string;
  mobile?: string;
  email?: string;
  picture?: string;
  role: "Admin" | "Manager" | "Store Incharge";
  branch_id?: string;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (mobile: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  branches: { id: string; name: string }[];
  selectedBranchId: string;
  setSelectedBranchId: (id: string) => void;
};

const Ctx = createContext<AuthCtx>({} as any);
export const useAuth = () => useContext(Ctx);

/** Persist session_token to storage and hydrate user state. */
async function persistSession(token: string, user: User, setUser: (u: User) => void) {
  await setToken(token);
  setUser(user);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");

  const loadBranches = useCallback(async () => {
    try {
      const list = await api<{ id: string; name: string }[]>("/branches");
      setBranches(list);
    } catch (e) {
      console.error("Failed to load branches in AuthProvider", e);
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadBranches();
      if (user.role !== "Admin") {
        setSelectedBranchId(user.branch_id || "");
      } else {
        setSelectedBranchId(""); // Default to "All Branches" for Admin
      }
    } else {
      setBranches([]);
      setSelectedBranchId("");
    }
  }, [user, loadBranches]);

  const refresh = useCallback(async () => {
    const t = await getToken();
    if (!t) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api<User>("/auth/me");
      setUser(me);
    } catch {
      await clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle callback session_id from URL (web) or deep link (mobile cold start)
  useEffect(() => {
    let sub: any = null;

    const handleCallbackUrl = async (url: string) => {
      const sid = extractSessionId(url);
      if (!sid) return false;
      try {
        setLoading(true);
        const data = await fetchSessionData(sid);
        const res = await exchangeWithBackend(data.session_token);
        await persistSession(res.token, res.user, setUser);
        // Clean the URL fragment on web to avoid re-processing
        if (Platform.OS === "web") {
          try {
            window.history.replaceState(null, "", window.location.pathname);
          } catch {}
        }
        return true;
      } catch (e) {
        console.warn("Google callback failed", e);
      } finally {
        setLoading(false);
      }
      return false;
    };

    (async () => {
      if (Platform.OS === "web") {
        const url = typeof window !== "undefined" ? window.location.href : "";
        const handled = await handleCallbackUrl(url);
        if (!handled) await refresh();
      } else {
        const initial = await Linking.getInitialURL();
        const handled = initial ? await handleCallbackUrl(initial) : false;
        if (!handled) await refresh();
        sub = Linking.addEventListener("url", (ev) => {
          if (ev.url) handleCallbackUrl(ev.url);
        });
      }
    })();

    return () => { if (sub && sub.remove) sub.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (mobile: string, password: string) => {
    const res = await api<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: { mobile, password },
      auth: false,
    });
    await setToken(res.token);
    setUser(res.user);
  }, []);

  const loginWithGoogle = useCallback(async () => {
    const res = await startGoogleLogin();
    if (res.cancelled) throw new Error("Sign-in cancelled");
    if (Platform.OS === "web") {
      // Page will navigate away; callback processed on remount
      return;
    }
    if (!res.url) throw new Error("No redirect URL returned");
    const sid = extractSessionId(res.url);
    if (!sid) throw new Error("Missing session_id in redirect");
    const data = await fetchSessionData(sid);
    const exch = await exchangeWithBackend(data.session_token);
    await persistSession(exch.token, exch.user, setUser);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {}
    await clearToken();
    setUser(null);
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, login, loginWithGoogle, logout, refresh, branches, selectedBranchId, setSelectedBranchId }}>
      {children}
    </Ctx.Provider>
  );
}
