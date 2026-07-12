import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import { colors, radius, shadow, spacing } from "@/src/theme";

const LOGO = require("../../assets/images/e3logo.png");

const ITEMS = [
  { key: "batches", label: "All Batches", icon: "package-variant-closed", route: "/batches", color: "#2E7D32" },
  { key: "payments", label: "Payments", icon: "cash-multiple", route: "/payments", color: "#43A047" },
  { key: "expenses", label: "Expenses", icon: "cash-minus", route: "/expenses", color: "#F57C00" },
  { key: "reports", label: "Reports", icon: "chart-bar", route: "/reports", color: "#1565C0" },
  { key: "maintenance", label: "Maintenance", icon: "wrench", route: "/maintenance", color: "#7B1FA2" },
  { key: "search", label: "Global Search", icon: "magnify", route: "/search", color: "#455A64" },
  { key: "audit", label: "Audit Trail", icon: "history", route: "/audit", color: "#5D4037" },
  { key: "settings", label: "Settings", icon: "cog", route: "/settings", color: "#607D8B" },
];

export default function MoreScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const onLogout = async () => {
    await logout();
    toast.show("Signed out");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.header}>
          <Text style={styles.title}>More</Text>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <Image source={LOGO} style={{ width: 36, height: 36 }} resizeMode="contain" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{user?.name}</Text>
            <Text style={styles.profileMobile}>{user?.mobile}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{user?.role}</Text>
            </View>
          </View>
        </View>

        <View style={styles.grid}>
          {ITEMS.map(item => (
            <TouchableOpacity
              key={item.key}
              testID={`more-${item.key}`}
              style={styles.item}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.85}
            >
              <View style={[styles.itemIcon, { backgroundColor: `${item.color}18` }]}>
                <MaterialCommunityIcons name={item.icon as any} size={22} color={item.color} />
              </View>
              <Text style={styles.itemLabel}>{item.label}</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textLight} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity testID="more-logout" style={styles.logoutBtn} onPress={onLogout}>
          <MaterialCommunityIcons name="logout" size={20} color={colors.danger} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>E3 · Post Harvest Processing Unit · v1.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { padding: spacing.xl, paddingBottom: spacing.md },
  title: { fontSize: 26, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  profileCard: { flexDirection: "row", alignItems: "center", marginHorizontal: spacing.xl, backgroundColor: colors.card, padding: spacing.lg, borderRadius: radius.xl, gap: spacing.md, marginBottom: spacing.lg, ...shadow.card },
  profileAvatar: { width: 56, height: 56, borderRadius: 20, backgroundColor: colors.primary50, alignItems: "center", justifyContent: "center" },
  profileName: { fontSize: 17, fontWeight: "800", color: colors.text },
  profileMobile: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  roleBadge: { alignSelf: "flex-start", marginTop: 6, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: colors.primary, borderRadius: radius.pill },
  roleText: { fontSize: 11, color: "#fff", fontWeight: "700", letterSpacing: 0.3 },
  grid: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  item: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, padding: spacing.md, borderRadius: radius.lg, gap: spacing.md, ...shadow.card },
  itemIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  itemLabel: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.text },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: spacing.xl, marginHorizontal: spacing.xl, paddingVertical: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.danger + "40", backgroundColor: colors.danger + "10" },
  logoutText: { fontSize: 15, fontWeight: "700", color: colors.danger },
  footer: { textAlign: "center", fontSize: 11, color: colors.textLight, marginTop: spacing.xl },
});
