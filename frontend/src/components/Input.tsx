import React from "react";
import { View, Text, TextInput, StyleSheet, TextInputProps } from "react-native";
import { colors, radius, spacing } from "@/src/theme";

type Props = TextInputProps & {
  label?: string;
  error?: string;
  testID?: string;
  leftIcon?: React.ReactNode;
};

export function Input({ label, error, style, leftIcon, testID, ...rest }: Props) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.wrap, error ? { borderColor: colors.danger } : null]}>
        {leftIcon ? <View style={{ marginRight: 8 }}>{leftIcon}</View> : null}
        <TextInput
          testID={testID}
          style={[styles.input, style]}
          placeholderTextColor={colors.textLight}
          {...rest}
        />
      </View>
      {error ? <Text style={styles.err}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: "700", color: colors.textMuted, marginBottom: 6, letterSpacing: 0.3, textTransform: "uppercase" },
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
  },
  input: { flex: 1, paddingVertical: 12, fontSize: 15, color: colors.text },
  err: { color: colors.danger, fontSize: 12, marginTop: 4 },
});
