import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useConnection } from "@/src/connection";
import { spacing } from "@/src/theme";

export function ConnectionBanner() {
  const { status, checkConnection } = useConnection();
  const [retrying, setRetrying] = React.useState(false);

  if (status === "online" || status === "checking") {
    return null;
  }

  const isWaking = status === "waking";
  const bg = isWaking ? "#FEF3C7" : "#FEE2E2";
  const fg = isWaking ? "#92400E" : "#991B1B";
  const icon = isWaking ? "cloud-sync" : "cloud-off-outline";
  const message = isWaking
    ? "Cloud backend is waking up (takes ~30s). Please wait..."
    : "Cannot connect to backend server.";

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await checkConnection();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <MaterialCommunityIcons name={icon} size={16} color={fg} style={{ marginRight: 6 }} />
      <Text style={[styles.text, { color: fg }]} numberOfLines={1}>
        {message}
      </Text>
      <TouchableOpacity
        onPress={handleRetry}
        disabled={retrying}
        style={[styles.retryBtn, { borderColor: fg }]}
        activeOpacity={0.7}
      >
        {retrying ? (
          <ActivityIndicator size="small" color={fg} />
        ) : (
          <Text style={[styles.retryText, { color: fg }]}>Retry</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  text: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
  },
  retryBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    marginLeft: spacing.xs,
  },
  retryText: {
    fontSize: 11,
    fontWeight: "700",
  },
});
