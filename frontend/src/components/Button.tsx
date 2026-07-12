import React from "react";
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, StyleProp } from "react-native";
import { colors, radius, spacing } from "@/src/theme";

type Props = {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  icon?: React.ReactNode;
};

export function Button({ title, onPress, variant = "primary", size = "md", loading, disabled, testID, style, icon }: Props) {
  const isDisabled = disabled || loading;
  const bg =
    variant === "primary" ? colors.primary :
    variant === "secondary" ? colors.accent :
    variant === "danger" ? colors.danger :
    "transparent";
  const border = variant === "outline" ? colors.primary : "transparent";
  const textColor = variant === "outline" || variant === "ghost" ? colors.primary : "#fff";
  const pad = size === "sm" ? 8 : size === "lg" ? 16 : 12;
  const font = size === "sm" ? 13 : 15;

  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.85}
      style={[
        styles.btn,
        { backgroundColor: bg, borderColor: border, borderWidth: variant === "outline" ? 1.5 : 0, paddingVertical: pad, opacity: isDisabled ? 0.55 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <>
          {icon}
          <Text style={[styles.text, { color: textColor, fontSize: font }]}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  text: { fontWeight: "700", letterSpacing: 0.2 },
});
