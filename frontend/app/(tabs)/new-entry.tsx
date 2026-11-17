import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useNavigation } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { useAuth } from "@/src/auth";

export default function NewEntrySheet() {
  const router = useRouter();
  const nav = useNavigation();
  const { user } = useAuth();
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
            {/* Sheet Handle */}
            <View style={styles.handle} />

            {/* Header with Title & Close Button */}
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Quick Actions</Text>
                <Text style={styles.subtitle}>Select an operation or transaction to record</Text>
              </View>
              <TouchableOpacity onPress={close} style={styles.closeBtn} activeOpacity={0.7} testID="quick-close-x">
                <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* 1. PLANT OPERATIONS SECTION (Arrival -> Processing -> Deliver) */}
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLine} />
              <Text style={styles.sectionTitle}>PLANT OPERATIONS</Text>
              <View style={styles.sectionHeaderLine} />
            </View>

            <View style={styles.pipelineRow}>
              {/* Step 1: Arrival */}
              <TouchableOpacity
                testID="quick-arrival"
                style={[styles.pipelineCard, { borderColor: "#DCFCE7", backgroundColor: "#FAFCFA" }]}
                activeOpacity={0.8}
                onPress={() => go("/arrival-form")}
              >
                <View style={[styles.stepBadge, { backgroundColor: "#DCFCE7" }]}>
                  <Text style={[styles.stepBadgeText, { color: "#15803D" }]}>1 · INBOUND</Text>
                </View>
                <View style={[styles.iconBoxCircle, { backgroundColor: "#DCFCE7" }]}>
                  <MaterialCommunityIcons name="arrow-down-circle" size={30} color="#15803D" />
                </View>
                <Text style={styles.pipelineCardTitle}>Arrival</Text>
                <Text style={styles.pipelineCardSub}>Wet produce</Text>
              </TouchableOpacity>

              {/* Step 2: Processing */}
              <TouchableOpacity
                testID="quick-processing"
                style={[styles.pipelineCard, { borderColor: "#FFEDD5", backgroundColor: "#FFFDFB" }]}
                activeOpacity={0.8}
                onPress={() => go("/batching-form")}
              >
                <View style={[styles.stepBadge, { backgroundColor: "#FFEDD5" }]}>
                  <Text style={[styles.stepBadgeText, { color: "#C2410C" }]}>2 · DRYING</Text>
                </View>
                <View style={[styles.iconBoxCircle, { backgroundColor: "#FFEDD5" }]}>
                  <MaterialCommunityIcons name="engine-outline" size={30} color="#C2410C" />
                </View>
                <Text style={styles.pipelineCardTitle}>Processing</Text>
                <Text style={styles.pipelineCardSub}>Load dryers</Text>
              </TouchableOpacity>

              {/* Step 3: Deliver */}
              <TouchableOpacity
                testID="quick-deliver"
                style={[styles.pipelineCard, { borderColor: "#F3E8FF", backgroundColor: "#FCFAFF" }]}
                activeOpacity={0.8}
                onPress={() => go("/delivery-picker")}
              >
                <View style={[styles.stepBadge, { backgroundColor: "#F3E8FF" }]}>
                  <Text style={[styles.stepBadgeText, { color: "#7C3AED" }]}>3 · DISPATCH</Text>
                </View>
                <View style={[styles.iconBoxCircle, { backgroundColor: "#F3E8FF" }]}>
                  <MaterialCommunityIcons name="truck-fast" size={30} color="#7C3AED" />
                </View>
                <Text style={styles.pipelineCardTitle}>Deliver</Text>
                <Text style={styles.pipelineCardSub}>Dry outturn</Text>
              </TouchableOpacity>
            </View>

            {/* 2. FINANCE & COMMERCIAL SECTION */}
            <View style={[styles.sectionHeader, { marginTop: spacing.lg }]}>
              <View style={styles.sectionHeaderLine} />
              <Text style={styles.sectionTitle}>FINANCE & COMMERCIAL</Text>
              <View style={styles.sectionHeaderLine} />
            </View>

            <View style={styles.financeRow}>
              {/* Cash Book */}
              <TouchableOpacity
                testID="quick-payment"
                style={[styles.financeCard, { borderColor: "#E0F2FE", backgroundColor: "#F8FAFC" }]}
                activeOpacity={0.8}
                onPress={() => go("/payments")}
              >
                <View style={[styles.financeIconBox, { backgroundColor: "#E0F2FE" }]}>
                  <MaterialCommunityIcons name="book-open-page-variant" size={28} color="#0284C7" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                    <Text style={styles.financeTitle} numberOfLines={1}>Cash Book</Text>
                    <View style={[styles.microTag, { backgroundColor: "#E0F2FE" }]}>
                      <Text style={[styles.microTagText, { color: "#0284C7" }]}>ACCOUNTS</Text>
                    </View>
                  </View>
                  <Text style={styles.financeSub} numberOfLines={2}>Inflows, outflows & collections</Text>
                </View>
              </TouchableOpacity>

              {/* Product Sale */}
              <TouchableOpacity
                testID="quick-sale"
                style={[styles.financeCard, { borderColor: "#CCFBF1", backgroundColor: "#F8FAFC" }]}
                activeOpacity={0.8}
                onPress={() => go("/sale-form")}
              >
                <View style={[styles.financeIconBox, { backgroundColor: "#CCFBF1" }]}>
                  <MaterialCommunityIcons name="tag-outline" size={28} color="#0D9488" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                    <Text style={styles.financeTitle} numberOfLines={1}>Sale</Text>
                    <View style={[styles.microTag, { backgroundColor: "#CCFBF1" }]}>
                      <Text style={[styles.microTagText, { color: "#0D9488" }]}>TRADE</Text>
                    </View>
                  </View>
                  <Text style={styles.financeSub} numberOfLines={2}>Product sale invoicing</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Cancel Dismiss Button */}
            <TouchableOpacity testID="quick-cancel" style={styles.cancelBtn} onPress={close} activeOpacity={0.8}>
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
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(15, 23, 42, 0.45)" },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    ...shadow.card,
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#E2E8F0",
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    fontSize: 23,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 13.5,
    color: "#64748B",
    marginTop: 3,
    fontWeight: "500",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.sm,
  },

  /* Section Header Dividers */
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  sectionHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E2E8F0",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 1,
    textTransform: "uppercase",
  },

  /* 3-Column Pipeline Grid */
  pipelineRow: {
    flexDirection: "row",
    gap: 12,
  },
  pipelineCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 8,
    borderRadius: 18,
    borderWidth: 1.5,
    ...shadow.sm,
  },
  stepBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 10,
  },
  stepBadgeText: {
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  iconBoxCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  pipelineCardTitle: {
    fontSize: 15.5,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.2,
    textAlign: "center",
  },
  pipelineCardSub: {
    fontSize: 11.5,
    color: "#64748B",
    marginTop: 3,
    fontWeight: "500",
    textAlign: "center",
  },

  /* 2-Column Finance Grid */
  financeRow: {
    flexDirection: "row",
    gap: 12,
  },
  financeCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    ...shadow.sm,
  },
  financeIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  financeTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  microTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  microTagText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  financeSub: {
    fontSize: 11.5,
    color: "#64748B",
    lineHeight: 16,
    fontWeight: "500",
  },

  /* Cancel Button */
  cancelBtn: {
    marginTop: 20,
    paddingVertical: 15,
    borderRadius: radius.pill,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
  },
  cancelText: {
    fontSize: 15.5,
    fontWeight: "700",
    color: "#64748B",
  },
});
