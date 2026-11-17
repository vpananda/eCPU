import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Pressable, Platform, Image, Animated, Easing } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSegments, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { useSync } from "@/src/sync";
import { useLanguage, LanguageCode } from "@/src/i18n";
import { LanguagePickerModal } from "@/src/components/LanguagePickerModal";
import { colors, radius, spacing, shadow } from "@/src/theme";

function getTitleKey(segments: string[]): string {
  if (!segments || segments.length === 0) return "title.dashboard";
  const first = segments[0];
  const second = segments[1];

  if (first === "(tabs)") {
    switch (second) {
      case "dashboard": return "title.dashboard";
      case "customers": return "title.customers";
      case "machines": return "title.machines";
      case "more": return "title.more";
      default: return "title.dashboard";
    }
  }

  switch (first) {
    case "arrival-form": return "title.arrival_form";
    case "arrivals": return "title.arrivals";
    case "audit": return "title.audit";
    case "batches": return "title.batches";
    case "batching-form": return "title.batching_form";
    case "load-dryer": return "title.load_dryer";
    case "stop-dryer": return "title.stop_dryer";
    case "branches-admin": return "title.branches_admin";
    case "customer-form": return "title.customer_form";
    case "delivery-picker": return "title.delivery_picker";
    case "delivery": return "title.delivery";
    case "expense-form": return "title.expense_form";
    case "expenses": return "title.expenses";
    case "machine-form": return "title.machine_form";
    case "maintenance-form": return "title.maintenance_form";
    case "maintenance": return "title.maintenance";
    case "payment-form": return "title.payment_form";
    case "payment-picker": return "title.payment_picker";
    case "payments": return "title.payments";
    case "sale-form": return "title.sale_form";
    case "sales": return "title.sales";
    case "reports": return "title.reports";
    case "search": return "title.search";
    case "settings": return "title.settings";
    case "users-admin": return "title.users_admin";
    default: return "";
  }
}

export function TopBanner() {
  const { user, branches, selectedBranchId, setSelectedBranchId } = useAuth();
  const { language, setLanguage, t, languages } = useLanguage();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const router = useRouter();

  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [langModalOpen, setLangModalOpen] = useState(false);

  const { isSyncing, triggerSync } = useSync();
  const spinVal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isSyncing) {
      Animated.loop(
        Animated.timing(spinVal, {
          toValue: 1,
          duration: 900,
          easing: Easing.linear,
          useNativeDriver: Platform.OS !== "web",
        })
      ).start();
    } else {
      spinVal.setValue(0);
    }
  }, [isSyncing, spinVal]);

  const spin = spinVal.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  // If not logged in, do not render the banner
  if (!user) return null;

  const titleKey = getTitleKey(segments);
  const title = titleKey ? t(titleKey) : "E3 Agro";

  const selectedBranchName = selectedBranchId
    ? branches.find(b => b.id === selectedBranchId)?.name || "Selected Branch"
    : t("common.all_branches", "All Branches");

  const currentLangObj = languages.find(l => l.code === language) || languages[0];

  const handleSelectBranch = (id: string) => {
    setSelectedBranchId(id);
    setBranchModalOpen(false);
  };

  const handleSelectLanguage = (code: LanguageCode) => {
    setLanguage(code);
    setLangModalOpen(false);
  };

  const handleBack = () => {
    if (router.canGoBack && router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/dashboard");
    }
  };

  const showBackButton = segments[0] !== "(tabs)";

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      {/* Tier 1: Screen Navigation Bar (Back Button + Full Screen Title + Quick Actions) */}
      <View style={styles.topRow}>
        <View style={styles.leftTitleWrap}>
          {showBackButton && (
            <TouchableOpacity onPress={handleBack} style={styles.backBtn} testID="header-back-button" activeOpacity={0.7}>
              <MaterialCommunityIcons name="arrow-left" size={23} color={colors.text} />
            </TouchableOpacity>
          )}
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
        </View>

        {/* Right Actions: Sync, Home, Avatar */}
        <View style={styles.rightActionsWrap}>
          <TouchableOpacity
            onPress={triggerSync}
            disabled={isSyncing}
            style={styles.iconActionBtn}
            testID="header-sync-button"
            activeOpacity={0.7}
            accessibilityLabel={t("common.sync", "Sync & Refresh")}
          >
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <MaterialCommunityIcons
                name="sync"
                size={18}
                color={isSyncing ? colors.primary : colors.textMuted}
              />
            </Animated.View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.replace("/(tabs)/dashboard")}
            style={styles.iconActionBtn}
            testID="header-home-button"
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="home-outline" size={19} color={colors.primary} />
          </TouchableOpacity>

          <View style={styles.avatarWrap}>
            {user?.picture ? (
              <Image source={{ uri: user.picture }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarInitials}>
                {(user?.name || "U").slice(0, 2).toUpperCase()}
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* Tier 2: Sub-bar with Branch Selector + Language Selector Chips */}
      <View style={styles.subBarRow}>
        {/* Branch Selector Chip */}
        {user.role === "Admin" ? (
          <TouchableOpacity
            onPress={() => setBranchModalOpen(true)}
            style={styles.branchChip}
            testID="header-branch-selector"
            activeOpacity={0.75}
          >
            <MaterialCommunityIcons name="office-building" size={14} color={colors.primary} style={{ marginRight: 4 }} />
            <Text style={styles.branchChipText} numberOfLines={1}>{selectedBranchName}</Text>
            <MaterialCommunityIcons name="chevron-down" size={14} color={colors.primary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.branchBadge}>
            <MaterialCommunityIcons name="office-building" size={13} color={colors.textMuted} style={{ marginRight: 4 }} />
            <Text style={styles.branchBadgeText} numberOfLines={1}>
              {user.branch_id ? branches.find(b => b.id === user.branch_id)?.name || "My Branch" : "Main Branch"}
            </Text>
          </View>
        )}

        {/* Language Selector Chip */}
        <TouchableOpacity
          onPress={() => setLangModalOpen(true)}
          style={styles.langChip}
          testID="header-language-selector"
          activeOpacity={0.75}
        >
          <MaterialCommunityIcons name="translate" size={13} color="#6D28D9" style={{ marginRight: 4 }} />
          <Text style={styles.langFlagText}>{currentLangObj.flag}</Text>
          <Text style={styles.langChipText} numberOfLines={1}>{currentLangObj.nativeName}</Text>
          <MaterialCommunityIcons name="chevron-down" size={13} color="#6D28D9" />
        </TouchableOpacity>
      </View>

      {/* Modal 1: Branch Selection Dropdown Modal (Admin only) */}
      <Modal
        visible={branchModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setBranchModalOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setBranchModalOpen(false)}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <MaterialCommunityIcons name="office-building" size={18} color={colors.primary} />
                <Text style={styles.modalTitle}>{t("common.select_branch", "Select Branch")}</Text>
              </View>
              <TouchableOpacity onPress={() => setBranchModalOpen(false)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll} bounces={false}>
              <TouchableOpacity
                onPress={() => handleSelectBranch("")}
                style={[styles.modalItem, !selectedBranchId && styles.modalItemSelected]}
              >
                <Text style={[styles.modalItemText, !selectedBranchId && styles.modalItemTextSelected]}>
                  {t("common.all_branches", "All Branches")}
                </Text>
                {!selectedBranchId && <MaterialCommunityIcons name="check" size={18} color={colors.primary} />}
              </TouchableOpacity>
              {branches.map(b => (
                <TouchableOpacity
                  key={b.id}
                  onPress={() => handleSelectBranch(b.id)}
                  style={[styles.modalItem, selectedBranchId === b.id && styles.modalItemSelected]}
                >
                  <Text style={[styles.modalItemText, selectedBranchId === b.id && styles.modalItemTextSelected]}>
                    {b.name}
                  </Text>
                  {selectedBranchId === b.id && <MaterialCommunityIcons name="check" size={18} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Modal 2: Language Selection Modal */}
      <LanguagePickerModal
        visible={langModalOpen}
        onClose={() => setLangModalOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    zIndex: 10,
    paddingBottom: 8,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
      },
      android: {
        elevation: 3,
      },
      web: {
        position: "sticky",
        top: 0,
      }
    })
  },

  // Row 1: Back + Title + Quick Actions
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    height: 44,
  },
  leftTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: spacing.sm,
  },
  backBtn: {
    marginRight: 6,
    padding: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.3,
  },
  rightActionsWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  iconActionBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginLeft: 2,
  },
  avatarImg: {
    width: 34,
    height: 34,
  },
  avatarInitials: {
    fontSize: 12,
    fontWeight: "800",
    color: "#ffffff",
  },

  // Row 2: Sub-bar with Branch Selector + Language Chips
  subBarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingTop: 4,
    gap: 8,
  },
  branchChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary50,
    borderWidth: 1,
    borderColor: colors.primary + "25",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    flex: 1,
    maxWidth: "68%",
  },
  branchChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
    marginRight: 3,
    flex: 1,
  },
  branchBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    flex: 1,
    maxWidth: "68%",
  },
  branchBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
    flex: 1,
  },

  // Language Chip
  langChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F3FF",
    borderWidth: 1,
    borderColor: "#DDD6FE",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  langFlagText: {
    fontSize: 12,
    marginRight: 3,
  },
  langChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6D28D9",
    marginRight: 2,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 27, 20, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  modalCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#ffffff",
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.card,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
  },
  modalScroll: {
    maxHeight: 280,
  },
  modalItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    marginBottom: 4,
  },
  modalItemSelected: {
    backgroundColor: colors.primary50,
  },
  modalItemSelectedLang: {
    backgroundColor: "#F5F3FF",
  },
  modalItemText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  modalItemTextSelected: {
    color: colors.primary,
    fontWeight: "800",
  },
  modalItemTextSelectedLang: {
    color: "#6D28D9",
    fontWeight: "800",
  },
  modalItemSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
});
