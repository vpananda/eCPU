import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { colors, radius, shadow, spacing } from "@/src/theme";

export function Card({ children, style, testID }: { children: React.ReactNode; style?: ViewStyle; testID?: string }) {
  return (
    <View testID={testID} style={[styles.card, style]}>
      {children}
    </View>
  );
}

export function Chip({ label, color, filled = false, testID }: { label: string; color?: string; filled?: boolean; testID?: string }) {
  const c = color || colors.primary;
  return (
    <View testID={testID} style={[styles.chip, filled ? { backgroundColor: c } : { borderColor: c, borderWidth: 1, backgroundColor: `${c}15` }]}>
      <Text style={[styles.chipText, { color: filled ? "#fff" : c }]}>{label}</Text>
    </View>
  );
}

export function StatusPill({ status, testID }: { status: string; testID?: string }) {
  const c = colors.status[status] || colors.textMuted;
  return (
    <View testID={testID} style={[styles.pill, { backgroundColor: `${c}18`, borderColor: `${c}55` }]}>
      <View style={[styles.dot, { backgroundColor: c }]} />
      <Text style={[styles.pillText, { color: c }]}>{status}</Text>
    </View>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.md }} />;
}

export function EmptyState({ icon, title, subtitle }: { icon?: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <View style={styles.empty}>
      {icon}
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySub}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.card,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  chipText: { fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: "flex-start",
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  empty: { alignItems: "center", padding: spacing.xxl, gap: spacing.sm },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  emptySub: { fontSize: 13, color: colors.textMuted, textAlign: "center" },
});
