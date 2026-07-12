import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, Animated } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useNavigation } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, radius, shadow, spacing } from "@/src/theme";

const ACTIONS = [
  { key: "arrival", label: "Arrival", subtitle: "New wet produce received", icon: "arrow-down-bold-circle", color: "#2E7D32", route: "/arrival-form" as const },
  { key: "deliver", label: "Deliver", subtitle: "Handover dried spice to customer", icon: "truck-fast", color: "#F57C00", route: "/delivery-picker" as const },
  { key: "expense", label: "Expense", subtitle: "Log operating expense", icon: "cash-minus", color: "#C62828", route: "/expense-form" as const },
  { key: "payment", label: "Payment", subtitle: "Collect balance amount", icon: "cash-plus", color: "#1565C0", route: "/payment-picker" as const },
];

export default function NewEntrySheet() {
  const router = useRouter();
  const nav = useNavigation();
  const [visible, setVisible] = useState(false);

  // Open sheet whenever the tab is focused; close when navigating away
  useFocusEffect(
    React.useCallback(() => {
      setVisible(true);
      return () => setVisible(false);
    }, [])
  );

  const close = () => {
    setVisible(false);
    // Return to previous tab so the modal isn't stuck
    // @ts-ignore
    if (nav.canGoBack?.()) router.back();
    else router.replace("/(tabs)/dashboard");
  };

  const go = (route: any) => {
    setVisible(false);
    setTimeout(() => router.push(route), 100);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Modal transparent visible={visible} animationType="fade" onRequestClose={close}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={close} testID="new-entry-backdrop" />
        <View style={styles.sheetWrap}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.title}>Quick Actions</Text>
            <Text style={styles.subtitle}>What would you like to record?</Text>

            <View style={styles.grid}>
              {ACTIONS.map(a => (
                <TouchableOpacity
                  key={a.key}
                  testID={`quick-${a.key}`}
                  style={styles.action}
                  activeOpacity={0.85}
                  onPress={() => go(a.route)}
                >
                  <View style={[styles.iconBox, { backgroundColor: `${a.color}18` }]}>
                    <MaterialCommunityIcons name={a.icon as any} size={30} color={a.color} />
                  </View>
                  <Text style={styles.actionLabel}>{a.label}</Text>
                  <Text style={styles.actionSub}>{a.subtitle}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity testID="quick-cancel" style={styles.cancel} onPress={close}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.5)" },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl + spacing.md,
    ...shadow.card,
  },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  title: { fontSize: 22, fontWeight: "800", color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginBottom: spacing.lg },
  action: {
    width: "47.6%",
    backgroundColor: colors.card,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  iconBox: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  actionLabel: { fontSize: 16, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  actionSub: { fontSize: 12, color: colors.textMuted, marginTop: 3, lineHeight: 16 },
  cancel: { paddingVertical: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border, alignItems: "center" },
  cancelText: { fontSize: 15, fontWeight: "700", color: colors.textMuted },
});
