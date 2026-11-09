import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { useConnection } from "@/src/connection";
import { useToast } from "@/src/components/Toast";

type SyncHandler = () => Promise<void> | void;

interface SyncContextValue {
  refreshKey: number;
  isSyncing: boolean;
  triggerSync: () => Promise<void>;
  registerRefreshHandler: (handler: SyncHandler) => () => void;
}

const SyncContext = createContext<SyncContextValue>({
  refreshKey: 0,
  isSyncing: false,
  triggerSync: async () => {},
  registerRefreshHandler: () => () => {},
});

export const useSync = () => useContext(SyncContext);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const handlersRef = useRef<Set<SyncHandler>>(new Set());
  const { checkConnection } = useConnection();
  const toast = useToast();

  const registerRefreshHandler = useCallback((handler: SyncHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  const triggerSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      // 1. Ping and wake backend
      await checkConnection();

      // 2. Invoke all registered page refresh handlers
      const currentHandlers = Array.from(handlersRef.current);
      if (currentHandlers.length > 0) {
        await Promise.all(
          currentHandlers.map(async (fn) => {
            try {
              await fn();
            } catch (err) {
              console.warn("Sync handler error:", err);
            }
          })
        );
      }

      // 3. Increment refreshKey for any component relying on key change
      setRefreshKey((k) => k + 1);

      toast.show("Data refreshed & synced with server!", "success");
    } catch (e: any) {
      toast.show(e.message || "Failed to sync data with server", "error");
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, checkConnection, toast]);

  return (
    <SyncContext.Provider
      value={{
        refreshKey,
        isSyncing,
        triggerSync,
        registerRefreshHandler,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

/**
 * Hook to automatically register a screen's data loader with the global Sync / Refresh button.
 */
export function useSyncRefresh(loadFn?: () => Promise<void> | void) {
  const { refreshKey, isSyncing, triggerSync, registerRefreshHandler } = useSync();

  useEffect(() => {
    if (!loadFn) return;
    return registerRefreshHandler(loadFn);
  }, [loadFn, registerRefreshHandler]);

  return { refreshKey, isSyncing, triggerSync };
}

