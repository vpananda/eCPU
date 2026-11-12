import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, Modal, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, radius, shadow, spacing } from "@/src/theme";

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  variant?: "danger" | "warning" | "primary";
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn>(() => Promise.resolve(false));

export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmModalProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((val: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    setOptions(opts);
    setVisible(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const handleClose = (result: boolean) => {
    setVisible(false);
    if (resolverRef.current) {
      resolverRef.current(result);
      resolverRef.current = null;
    }
  };

  const isDanger = options?.destructive || options?.variant === "danger";
  const isWarning = options?.variant === "warning";

  const iconName = options?.icon || (isDanger ? "trash-can-outline" : isWarning ? "alert-outline" : "help-circle-outline");
  const iconColor = isDanger ? colors.danger : isWarning ? "#EA580C" : colors.primary;
  const iconBg = isDanger ? colors.danger + "15" : isWarning ? "#FFEDD5" : colors.primary50;
  const confirmBtnBg = isDanger ? colors.danger : isWarning ? "#EA580C" : colors.primary;

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => handleClose(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
                <MaterialCommunityIcons name={iconName} size={24} color={iconColor} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.title}>{options?.title || "Confirmation"}</Text>
              </View>
              <TouchableOpacity
                onPress={() => handleClose(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.closeBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.messageBox}>
              <Text style={styles.messageText}>{options?.message}</Text>
            </View>

            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => handleClose(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelBtnText}>{options?.cancelText || "Cancel"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: confirmBtnBg }]}
                onPress={() => handleClose(true)}
                activeOpacity={0.85}
              >
                <Text style={styles.confirmBtnText}>{options?.confirmText || "Confirm"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ConfirmCtx.Provider>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: spacing.xl,
    maxWidth: 420,
    width: "100%",
    ...shadow.card,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.text,
  },
  closeBtn: {
    padding: 6,
    borderRadius: radius.pill,
    backgroundColor: "#F1F5F9",
  },
  messageBox: {
    marginBottom: spacing.xl,
  },
  messageText: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    fontWeight: "500",
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  confirmBtn: {
    flex: 1.2,
    paddingVertical: 12,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#fff",
  },
});

