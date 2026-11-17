import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useNavigation } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { useLanguage } from "@/src/i18n";

interface ActionItem {
  key: string;
  label: string;
  subtitle: string;
  badge: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  iconColor: string;
  badgeColor: string;
  badgeTextColor: string;
  cardBorder: string;
  cardBg: string;
  route: string;
}

const PLANT_OPERATIONS: ActionItem[] = [
  {
    key: "arrival",
    label: "Arrival",
    subtitle: "Record new wet cardamom produce received from farmer",
    badge: "1 · INBOUND",
    icon: "arrow-down-circle",
    iconColor: "#15803D",
    badgeColor: "#DCFCE7",
    badgeTextColor: "#15803D",
    cardBorder: "#DCFCE7",
    cardBg: "#FAFCFA",
    route: "/arrival-form",
  },
  {
    key: "processing",
    label: "Processing",
    subtitle: "Load arrivals into dryers & track running batches",
    badge: "2 · DRYING",
    icon: "engine-outline",
    iconColor: "#C2410C",
    badgeColor: "#FFEDD5",
    badgeTextColor: "#C2410C",
    cardBorder: "#FFEDD5",
    cardBg: "#FFFDFB",
    route: "/batching-form",
  },
  {
    key: "deliver",
    label: "Deliver",
    subtitle: "Handover dried spice outturn to customer",
    badge: "3 · DISPATCH",
    icon: "truck-fast",
    iconColor: "#7C3AED",
    badgeColor: "#F3E8FF",
    badgeTextColor: "#7C3AED",
    cardBorder: "#F3E8FF",
    cardBg: "#FCFAFF",
    route: "/delivery-picker",
  },
];

const FINANCE_ACTIONS: ActionItem[] = [
  {
    key: "payment",
    label: "Cash Book",
    subtitle: "Record inflows, expenses & pending collections",
    badge: "ACCOUNTS",
    icon: "book-open-page-variant",
    iconColor: "#0284C7",
    badgeColor: "#E0F2FE",
    badgeTextColor: "#0284C7",
    cardBorder: "#E0F2FE",
    cardBg: "#F8FAFC",
    route: "/payments",
  },
  {
    key: "sale",
    label: "Sale",
    subtitle: "Create spice sales invoice & customer receipt",
    badge: "TRADE",
    icon: "tag-outline",
    iconColor: "#0D9488",
    badgeColor: "#CCFBF1",
    badgeTextColor: "#0D9488",
    cardBorder: "#CCFBF1",
    cardBg: "#F8FAFC",
    route: "/sale-form",
  },
];

export default function NewEntrySheet() {
  const router = useRouter();
  const nav = useNavigation();
  const { user } = useAuth();
  const { t } = useLanguage();
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

  const renderActionRow = (item: ActionItem) => (
    <TouchableOpacity
      key={item.key}
      testID={`quick-${item.key}`}
      style={[
        styles.actionRow,
        {
          borderColor: item.cardBorder,
          backgroundColor: item.cardBg,
        },
      ]}
      activeOpacity={0.78}
      onPress={() => go(item.route)}
    >
      {/* Icon Box */}
      <View style={[styles.iconBox, { backgroundColor: item.badgeColor }]}>
        <MaterialCommunityIcons name={item.icon} size={28} color={item.iconColor} />
      </View>

      {/* Main Content */}
      <View style={styles.actionBody}>
        <View style={styles.actionTopLine}>
          <Text style={styles.actionTitle}>{t(`quick.${item.key}`, item.label)}</Text>
          <View style={[styles.badge, { backgroundColor: item.badgeColor }]}>
            <Text style={[styles.badgeText, { color: item.badgeTextColor }]}>{item.badge}</Text>
          </View>
        </View>
        <Text style={styles.actionSubtitle} numberOfLines={2}>
          {t(`quick.${item.key}_sub`, item.subtitle)}
        </Text>
      </View>

      {/* Navigation Arrow */}
      <MaterialCommunityIcons name="chevron-right" size={24} color="#94A3B8" style={styles.chevron} />
    </TouchableOpacity>
  );

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

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              bounces={false}
            >
              {/* 1. PLANT OPERATIONS SECTION */}
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderLine} />
                <Text style={styles.sectionTitle}>{t("section.plant_operations", "PLANT OPERATIONS")}</Text>
                <View style={styles.sectionHeaderLine} />
              </View>

              <View style={styles.groupRows}>
                {PLANT_OPERATIONS.map(renderActionRow)}
              </View>

              {/* 2. FINANCE & TRADE SECTION */}
              <View style={[styles.sectionHeader, { marginTop: spacing.md }]}>
                <View style={styles.sectionHeaderLine} />
                <Text style={styles.sectionTitle}>{t("section.finance_trade", "FINANCE & TRADE")}</Text>
                <View style={styles.sectionHeaderLine} />
              </View>

              <View style={styles.groupRows}>
                {FINANCE_ACTIONS.map(renderActionRow)}
              </View>

              {/* Cancel Dismiss Button */}
              <TouchableOpacity testID="quick-cancel" style={styles.cancelBtn} onPress={close} activeOpacity={0.8}>
                <Text style={styles.cancelText}>{t("common.cancel", "Cancel")}</Text>
              </TouchableOpacity>
            </ScrollView>
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
    paddingBottom: 24,
    maxHeight: "88%",
    ...shadow.card,
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#E2E8F0",
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  title: {
    fontSize: 23,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
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
  scrollContent: {
    paddingBottom: spacing.lg,
  },

  /* Section Header Dividers */
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
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

  /* Row List Container */
  groupRows: {
    gap: 10,
  },

  /* Action Row Card */
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    ...shadow.sm,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  actionBody: {
    flex: 1,
    justifyContent: "center",
  },
  actionTopLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  actionTitle: {
    fontSize: 16.5,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  actionSubtitle: {
    fontSize: 12.5,
    color: "#64748B",
    lineHeight: 17,
    fontWeight: "500",
  },
  chevron: {
    marginLeft: 10,
  },

  /* Cancel Button */
  cancelBtn: {
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: radius.pill,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#64748B",
  },
});
