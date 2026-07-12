import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, setToken, clearToken, getToken } from "@/src/api";

type User = {
  id: string;
  name: string;
  mobile: string;
  role: "Admin" | "Manager" | "Store Incharge";
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (mobile: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({} as any);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (mobile: string, password: string) => {
    const res = await api<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: { mobile, password },
      auth: false,
    });
    await setToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    await clearToken();
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, loading, login, logout, refresh }}>{children}</Ctx.Provider>;
}
