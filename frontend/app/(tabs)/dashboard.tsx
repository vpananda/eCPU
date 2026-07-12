import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { Card } from "@/src/components/ui";

type Dash = {
  today_customers: number;
  today_received_weight: number;
  today_deliveries: number;
  today_collection: number;
  today_expenses: number;
  today_profit: number;
  pending_payments: number;
  machines_running: number;
  machines_available: number;
  machines_maintenance: number;
  total_machines: number;
  recent_activities: any[];
};

const METRICS: { key: keyof Dash; label: string; icon: any; color: string; prefix?: string; suffix?: string }[] = [
  { key: "today_customers", label: "Customers Today", icon: "account-multiple-plus", color: "#2E7D32" },
  { key: "today_received_weight", label: "Received (kg)", icon: "weight-kilogram", color: "#1565C0", suffix: " kg" },
  { key: "today_deliveries", label: "Deliveries", icon: "truck-check", color: "#7B1FA2" },
  { key: "today_collection", label: "Collection", icon: "cash-multiple", color: "#43A047", prefix: "₹" },
  { key: "today_expenses", label: "Expenses", icon: "cash-minus", color: "#F57C00", prefix: "₹" },
  { key: "pending_payments", label: "Pending Dues", icon: "clock-alert-outline", color: "#C62828", prefix: "₹" },
];

function fmt(v: any, prefix = "", suffix = "") {
  if (typeof v !== "number") return `${prefix}${v ?? 0}${suffix}`;
  return `${prefix}${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}${suffix}`;
}

function activityText(a: any): string {
  const parts: Record<string, string> = {
    create_batch: "New batch created",
    create_customer: "New customer added",
    create_payment: "Payment recorded",
    create_expense: "Expense recorded",
    update_status_batch: "Batch status updated",
    update_status_machine: "Machine status changed",
    delivery_batch: "Batch delivered",
    create_maintenance: "Maintenance logged",
  };
  const key = `${a.action}_${a.entity}`;
  return parts[key] || `${a.action} ${a.entity}`;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<Dash>("/dashboard");
      setData(d);
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hello}>Good day,</Text>
            <Text style={styles.userName} testID="dashboard-user-name">{user?.name}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{user?.role}</Text>
            </View>
          </View>
          <TouchableOpacity testID="dashboard-search-button" onPress={() => router.push("/search")} style={styles.iconBtn}>
            <MaterialCommunityIcons name="magnify" size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {loading && !data ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}><ActivityIndicator color={colors.primary} /></View>
        ) : (
          <>
            {/* Profit hero */}
            <View style={styles.profitCard} testID="dashboard-profit-card">
              <View style={{ flex: 1 }}>
                <Text style={styles.profitLabel}>{"Today's Profit"}</Text>
                <Text style={styles.profitValue}>
                  ₹{(data?.today_profit || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </Text>
                <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.sm }}>
                  <View style={styles.profitStat}>
                    <MaterialCommunityIcons name="arrow-up-bold" size={14} color="#B9F6CA" />
                    <Text style={styles.profitStatText}>₹{data?.today_collection.toFixed(0)} in</Text>
                  </View>
                  <View style={styles.profitStat}>
                    <MaterialCommunityIcons name="arrow-down-bold" size={14} color="#FFCDD2" />
                    <Text style={styles.profitStatText}>₹{data?.today_expenses.toFixed(0)} out</Text>
                  </View>
                </View>
              </View>
              <View style={styles.profitIcon}>
                <MaterialCommunityIcons name="chart-line" size={36} color="#fff" />
              </View>
            </View>

            {/* Metric grid */}
            <View style={styles.grid}>
              {METRICS.map(m => (
                <View key={String(m.key)} style={styles.metric} testID={`metric-${String(m.key)}`}>
                  <View style={[styles.metricIcon, { backgroundColor: `${m.color}18` }]}>
                    <MaterialCommunityIcons name={m.icon} size={20} color={m.color} />
                  </View>
                  <Text style={styles.metricValue}>{fmt(data?.[m.key] as any, m.prefix, m.suffix)}</Text>
                  <Text style={styles.metricLabel}>{m.label}</Text>
                </View>
              ))}
            </View>

            {/* Machines snapshot */}
            <TouchableOpacity
              testID="dashboard-machines-card"
              activeOpacity={0.85}
              onPress={() => router.push("/(tabs)/machines")}
              style={styles.machineSnap}
            >
              <View style={styles.machineHeader}>
                <Text style={styles.sectionTitle}>Machine Status</Text>
                <MaterialCommunityIcons name="arrow-right" size={18} color={colors.primary} />
              </View>
              <View style={styles.machineRow}>
                <MachineStat label="Running" value={data?.machines_running || 0} color={colors.status.Running} icon="play-circle" />
                <MachineStat label="Available" value={data?.machines_available || 0} color={colors.status.Available} icon="check-circle" />
                <MachineStat label="Service" value={data?.machines_maintenance || 0} color={colors.status.Maintenance} icon="wrench" />
              </View>
            </TouchableOpacity>

            {/* Recent Activity */}
            <View style={styles.activityCard}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
              {(data?.recent_activities || []).length === 0 && (
                <Text style={styles.emptyText}>No activity yet.</Text>
              )}
              {(data?.recent_activities || []).slice(0, 8).map((a, i) => (
                <View key={a.id || i} style={styles.actRow}>
                  <View style={styles.actDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actText}>{activityText(a)}</Text>
                    <Text style={styles.actMeta}>by {a.user_role} · {new Date(a.timestamp).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function MachineStat({ label, value, color, icon }: any) {
  return (
    <View style={styles.machineStat}>
      <View style={[styles.machineStatIcon, { backgroundColor: `${color}18` }]}>
        <MaterialCommunityIcons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.machineStatValue}>{value}</Text>
      <Text style={styles.machineStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md },
  hello: { fontSize: 13, color: colors.textMuted, fontWeight: "500" },
  userName: { fontSize: 22, fontWeight: "800", color: colors.text, marginTop: 2, letterSpacing: -0.4 },
  roleBadge: { alignSelf: "flex-start", marginTop: 6, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: colors.primary50, borderRadius: radius.pill },
  roleText: { fontSize: 11, color: colors.primaryDark, fontWeight: "700", letterSpacing: 0.3 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary50, alignItems: "center", justifyContent: "center" },

  profitCard: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.primary,
    padding: spacing.xl,
    borderRadius: radius.xxl,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
    ...shadow.card,
  },
  profitLabel: { color: "#B9F6CA", fontSize: 13, fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase" },
  profitValue: { color: "#fff", fontSize: 30, fontWeight: "800", marginTop: 6, letterSpacing: -0.5 },
  profitStat: { flexDirection: "row", alignItems: "center", gap: 4 },
  profitStatText: { color: "#E8F5E9", fontSize: 12, fontWeight: "600" },
  profitIcon: { width: 62, height: 62, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },

  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: spacing.xl, gap: spacing.md, marginBottom: spacing.lg },
  metric: {
    width: "47.5%",
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.card,
  },
  metricIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  metricValue: { fontSize: 18, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  metricLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2, fontWeight: "500" },

  machineSnap: { marginHorizontal: spacing.xl, backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.lg, ...shadow.card },
  machineHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  machineRow: { flexDirection: "row", justifyContent: "space-between" },
  machineStat: { alignItems: "center", flex: 1 },
  machineStatIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  machineStatValue: { fontSize: 20, fontWeight: "800", color: colors.text },
  machineStatLabel: { fontSize: 11, color: colors.textMuted, fontWeight: "600" },

  activityCard: { marginHorizontal: spacing.xl, backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.lg, ...shadow.card },
  actRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  actDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6 },
  actText: { fontSize: 13, color: colors.text, fontWeight: "600" },
  actMeta: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  emptyText: { fontSize: 13, color: colors.textMuted, paddingVertical: spacing.md, textAlign: "center" },
});
