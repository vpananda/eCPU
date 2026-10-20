import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { AppState, AppStateStatus } from "react-native";
import { pingBackend, BASE } from "@/src/api";

export type ConnectionStatus = "online" | "waking" | "offline" | "checking";

export interface ConnectionContextValue {
  status: ConnectionStatus;
  isOnline: boolean;
  latency: number | null;
  backendUrl: string;
  lastChecked: Date | null;
  errorMessage: string | null;
  checkConnection: () => Promise<boolean>;
}

const ConnectionCtx = createContext<ConnectionContextValue>({
  status: "checking",
  isOnline: true,
  latency: null,
  backendUrl: BASE,
  lastChecked: null,
  errorMessage: null,
  checkConnection: async () => false,
});

export const useConnection = () => useContext(ConnectionCtx);

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>("checking");
  const [latency, setLatency] = useState<number | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const checkConnection = useCallback(async (): Promise<boolean> => {
    setStatus(prev => (prev === "online" ? "checking" : prev));
    const result = await pingBackend(12000);
    setLastChecked(new Date());

    if (result.ok) {
      setStatus("online");
      setLatency(result.latency);
      setErrorMessage(null);
      return true;
    } else {
      const isWakeCandidate =
        result.error?.includes("timed out") ||
        (result.latency !== undefined && result.latency >= 10000);
      setStatus(isWakeCandidate ? "waking" : "offline");
      setLatency(result.latency);
      setErrorMessage(result.error || "Cannot reach backend");
      return false;
    }
  }, []);

  useEffect(() => {
    checkConnection();

    // Check periodically every 45s
    const interval = setInterval(checkConnection, 45000);

    // Check when user resumes app
    const sub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active") {
        checkConnection();
      }
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [checkConnection]);

  return (
    <ConnectionCtx.Provider
      value={{
        status,
        isOnline: status === "online",
        latency,
        backendUrl: BASE,
        lastChecked,
        errorMessage,
        checkConnection,
      }}
    >
      {children}
    </ConnectionCtx.Provider>
  );
}
