import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, ActivityIndicator, Linking } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useConnection } from "@/src/connection";
import { colors, radius, spacing, shadow } from "@/src/theme";

interface ConnectionBadgeProps {
  compact?: boolean;
  showPing?: boolean;
  style?: any;
}

export function ConnectionBadge({ compact = false, showPing = true, style }: ConnectionBadgeProps) {
  const { status, latency, backendUrl, lastChecked, errorMessage, checkConnection } = useConnection();
  const [modalOpen, setModalOpen] = useState(false);
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    try {
      await checkConnection();
    } finally {
      setTesting(false);
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case "online":
        return "#10B981"; // vibrant green
      case "waking":
        return "#F59E0B"; // amber / yellow
      case "offline":
        return "#EF4444"; // red
      case "checking":
      default:
        return "#6B7280"; // neutral grey
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case "online":
        return showPing && latency ? `${latency}ms` : "Online";
      case "waking":
        return "Waking...";
      case "offline":
        return "Offline";
      case "checking":
        return "Checking...";
    }
  };

  const color = getStatusColor();
  const label = getStatusLabel();

  return (
    <>
      <TouchableOpacity
        style={[styles.badge, { borderColor: `${color}40`, backgroundColor: `${color}14` }, style]}
        onPress={() => setModalOpen(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Backend connection status: ${status}`}
      >
        <View style={[styles.dot, { backgroundColor: color }]} />
        {!compact && <Text style={[styles.badgeText, { color }]}>{label}</Text>}
      </TouchableOpacity>

      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setModalOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalOpen(false)}
        >
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <View style={[styles.iconCircle, { backgroundColor: `${color}20` }]}>
                <MaterialCommunityIcons
                  name={status === "online" ? "cloud-check" : status === "waking" ? "cloud-sync" : "cloud-alert"}
                  size={26}
                  color={color}
                />
              </View>
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={styles.modalTitle}>Backend Connection</Text>
                <Text style={[styles.modalSubtitle, { color }]}>
                  {status === "online"
                    ? "Connected & Operational"
                    : status === "waking"
                    ? "Waking up Cloud Server..."
                    : "Server Unreachable"}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setModalOpen(false)} style={styles.closeBtn}>
                <MaterialCommunityIcons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.infoBox}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Server URL</Text>
                <Text style={styles.infoValue} numberOfLines={1}>{backendUrl}</Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Round-Trip Latency</Text>
                <Text style={[styles.infoValue, { fontWeight: "700" }]}>
                  {latency !== null ? `${latency} ms` : "—"}
                </Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Last Verified</Text>
                <Text style={styles.infoValue}>
                  {lastChecked ? lastChecked.toLocaleTimeString() : "Never"}
                </Text>
              </View>

              {errorMessage && status !== "online" ? (
                <>
                  <View style={styles.divider} />
                  <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: colors.danger }]}>Error</Text>
                    <Text style={[styles.infoValue, { color: colors.danger }]} numberOfLines={2}>
                      {errorMessage}
                    </Text>
                  </View>
                </>
              ) : null}
            </View>

            <View style={styles.tipCard}>
              <MaterialCommunityIcons name="information-outline" size={16} color={colors.primary} style={{ marginTop: 2 }} />
              <Text style={styles.tipText}>
                The backend is hosted on Render. Free cloud instances go to sleep after 15 minutes of inactivity and typically take 30–45 seconds to wake up on the first request.
              </Text>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.testBtn, testing && styles.btnDisabled]}
                onPress={handleTest}
                disabled={testing}
                activeOpacity={0.8}
              >
                {testing ? (
                  <ActivityIndicator size="small" color="#fff" style={{ marginRight: spacing.xs }} />
                ) : (
                  <MaterialCommunityIcons name="refresh" size={18} color="#fff" style={{ marginRight: spacing.xs }} />
                )}
                <Text style={styles.testBtnText}>
                  {testing ? "Testing..." : "Test Connection"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.doneBtn}
                onPress={() => setModalOpen(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.doneBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: spacing.xl,
    ...shadow.card,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  modalSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  infoBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  infoLabel: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "600",
  },
  infoValue: {
    fontSize: 12,
    color: colors.text,
    maxWidth: 220,
    textAlign: "right",
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  tipCard: {
    flexDirection: "row",
    backgroundColor: "#EFF6FF",
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  tipText: {
    flex: 1,
    fontSize: 11,
    color: "#1E40AF",
    lineHeight: 16,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  testBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingVertical: 11,
    borderRadius: radius.md,
  },
  testBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  btnDisabled: {
    opacity: 0.6,
  },
  doneBtn: {
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  doneBtnText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
});
