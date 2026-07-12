import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { colors, radius, shadow, spacing } from "@/src/theme";

type ToastType = "success" | "error" | "info";
type ToastCtx = { show: (msg: string, type?: ToastType) => void };

const Ctx = createContext<ToastCtx>({ show: () => {} });
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; type: ToastType } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<any>(null);

  const show = useCallback((text: string, type: ToastType = "success") => {
    setMsg({ text, type });
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMsg(null));
    }, 2400);
  }, [opacity]);

  useEffect(() => () => timer.current && clearTimeout(timer.current), []);

  const bg = msg?.type === "error" ? colors.danger : msg?.type === "info" ? colors.info : colors.primary;

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {msg && (
        <Animated.View pointerEvents="none" style={[styles.wrap, { opacity }]}>
          <View style={[styles.toast, { backgroundColor: bg }]} testID="toast-message">
            <Text style={styles.text}>{msg.text}</Text>
          </View>
        </Animated.View>
      )}
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 9999,
  },
  toast: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    maxWidth: "90%",
    ...shadow.fab,
  },
  text: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
