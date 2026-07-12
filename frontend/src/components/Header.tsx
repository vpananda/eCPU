import React from "react";
import { View, Text, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { colors, spacing } from "@/src/theme";

export function Header({ title, right, subtitle, style }: { title: string; subtitle?: string; right?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.header, style]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right ? <View>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.bg,
    gap: spacing.md,
  },
  title: { fontSize: 24, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
});
