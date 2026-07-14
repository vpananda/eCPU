import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSegments, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { colors, radius, spacing, shadow } from "@/src/theme";

function getHeaderTitle(segments: string[]): string {
  if (!segments || segments.length === 0) return "E3 Dryer Manager";
  const first = segments[0];
  const second = segments[1];

  if (first === "(tabs)") {
    switch (second) {
      case "dashboard": return "Dashboard";
      case "customers": return "Customers";
      case "machines": return "Machines";
      case "more": return "More Settings";
      default: return "E3 Dryer Manager";
    }
  }

  switch (first) {
    case "arrival-form": return "New Arrival";
    case "arrivals": return "Arrival Logs";
    case "audit": return "Audit Trail";
    case "batches": return "Batch List";
    case "branches-admin": return "Manage Branches";
    case "customer-form": return "New Customer";
    case "delivery-picker": return "Deliver Produce";
    case "expense-form": return "Record Expense";
    case "expenses": return "Expenses";
    case "machine-form": return "New Machine";
    case "maintenance-form": return "Record Maintenance";
    case "maintenance": return "Maintenance Logs";
    case "payment-picker": return "Collect Payment";
    case "payments": return "Payments";
    case "reports": return "Business Reports";
    case "search": return "Search System";
    case "settings": return "System Settings";
    case "users-admin": return "Manage Users";
    case "batch": return "Batch Details";
    case "customer": return "Customer Profile";
    case "delivery": return "Delivery Details";
    case "machine": return "Machine Details";
    case "payment": return "Payment Details";
    default: return "E3 Dryer Manager";
  }
}

export function TopBanner() {
  const { user, logout, branches, selectedBranchId, setSelectedBranchId } = useAuth();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);

  // If not logged in, do not render the banner
  if (!user) return null;

  const title = getHeaderTitle(segments);
  const selectedBranchName = selectedBranchId
    ? branches.find(b => b.id === selectedBranchId)?.name || "Selected Branch"
    : "All Branches";

  const handleSelectBranch = (id: string) => {
    setSelectedBranchId(id);
    setModalOpen(false);
  };

  const handleSignOut = () => {
    logout().then(() => {
      router.replace("/login");
    });
  };

  const showBackButton = segments[0] !== "(tabs)";

  return (
    <View style={[styles.container, { paddingTop: insets.top + 6 }]}>
      <View style={styles.content}>
        {/* Left Side: Back button + Title */}
        <View style={styles.left}>
          {showBackButton && (
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="header-back-button">
              <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
            </TouchableOpacity>
          )}
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
        </View>

        {/* Right Side: Branch selector + Log out */}
        <View style={styles.right}>
          {user.role === "Admin" ? (
            <TouchableOpacity
              onPress={() => setModalOpen(true)}
              style={styles.branchSelector}
              testID="header-branch-selector"
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="office-building" size={16} color={colors.primary} style={{ marginRight: 4 }} />
              <Text style={styles.branchText} numberOfLines={1}>{selectedBranchName}</Text>
              <MaterialCommunityIcons name="chevron-down" size={16} color={colors.primary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.branchBadge}>
              <MaterialCommunityIcons name="office-building" size={13} color={colors.textMuted} style={{ marginRight: 4 }} />
              <Text style={styles.branchBadgeText} numberOfLines={1}>
                {user.branch_id ? branches.find(b => b.id === user.branch_id)?.name || "My Branch" : "Main Branch"}
              </Text>
            </View>
          )}

          <TouchableOpacity
            onPress={handleSignOut}
            style={styles.logoutBtn}
            testID="header-signout-button"
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="logout" size={20} color={colors.danger} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Branch Selection Dropdown Modal (Admin only) */}
      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setModalOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setModalOpen(false)}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Branch</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll} bounces={false}>
              <TouchableOpacity
                onPress={() => handleSelectBranch("")}
                style={[styles.modalItem, !selectedBranchId && styles.modalItemSelected]}
              >
                <Text style={[styles.modalItemText, !selectedBranchId && styles.modalItemTextSelected]}>All Branches</Text>
                {!selectedBranchId && <MaterialCommunityIcons name="check" size={18} color={colors.primary} />}
              </TouchableOpacity>
              {branches.map(b => (
                <TouchableOpacity
                  key={b.id}
                  onPress={() => handleSelectBranch(b.id)}
                  style={[styles.modalItem, selectedBranchId === b.id && styles.modalItemSelected]}
                >
                  <Text style={[styles.modalItemText, selectedBranchId === b.id && styles.modalItemTextSelected]}>{b.name}</Text>
                  {selectedBranchId === b.id && <MaterialCommunityIcons name="check" size={18} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    zIndex: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
      web: {
        position: "sticky",
        top: 0,
      }
    })
  },
  content: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: spacing.sm,
  },
  backBtn: {
    marginRight: spacing.sm,
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    fontFamily: "Poppins-SemiBold",
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
  },
  branchSelector: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary50,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: radius.md,
    marginRight: spacing.sm,
    maxWidth: 160,
  },
  branchText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
    marginRight: 4,
    fontFamily: "Poppins-SemiBold",
  },
  branchBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: radius.md,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 160,
  },
  branchBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  logoutBtn: {
    padding: 6,
    borderRadius: radius.sm,
    backgroundColor: "#FFEBEE",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 27, 20, 0.4)",
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
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  modalScroll: {
    maxHeight: 280,
  },
  modalItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: 4,
  },
  modalItemSelected: {
    backgroundColor: colors.primary50,
  },
  modalItemText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.text,
  },
  modalItemTextSelected: {
    color: colors.primary,
    fontWeight: "700",
  },
});
