import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator, Modal, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, radius, shadow, spacing } from "@/src/theme";

type Dash = {
  range: { start: string; end: string };
  today_arrival: { in_weight: number; in_count: number; out_weight: number; out_count: number };
  period_customers: number;
  period_received_weight: number;
  period_deliveries: number;
  period_delivered_weight: number;
  period_collection: number;
  period_expenses: number;
  period_profit: number;
  pending_payments: number;
  machines_running: number;
  machines_available: number;
  machines_maintenance: number;
  total_machines: number;
  recent_activities: any[];
};

function fmtNum(v: number, prefix = "", suffix = "") {
  return `${prefix}${(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}${suffix}`;
}

function todayISO() { return new Date().toISOString().slice(0, 10); }
function monthStartISO() {
  const d = new Date(); d.setDate(1);
  return d.toISOString().slice(0, 10);
}
function fmtDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

const PRESETS = [
  { key: "today", label: "Today" },
  { key: "week", label: "Last 7 days" },
  { key: "month", label: "This Month" },
  { key: "30d", label: "Last 30 days" },
];

function activityText(a: any): string {
  const parts: Record<string, string> = {
    create_batch: "New batch created", create_customer: "New customer added",
    create_payment: "Payment recorded", create_expense: "Expense recorded",
    update_status_batch: "Batch status updated", update_status_machine: "Machine status changed",
    delivery_batch: "Batch delivered", create_maintenance: "Maintenance logged",
  };
  return parts[`${a.action}_${a.entity}`] || `${a.action} ${a.entity}`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [start, setStart] = useState(monthStartISO());
  const [end, setEnd] = useState(todayISO());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(start);
  const [draftEnd, setDraftEnd] = useState(end);

  const load = useCallback(async (s = start, e = end) => {
    try {
      const d = await api<Dash>(`/dashboard?start=${s}&end=${e}`);
      setData(d);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [start, end]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const applyPreset = (key: string) => {
    const today = new Date();
    let s = todayISO();
    if (key === "week") {
      const d = new Date(); d.setDate(d.getDate() - 6); s = d.toISOString().slice(0, 10);
    } else if (key === "month") {
      s = monthStartISO();
    } else if (key === "30d") {
      const d = new Date(); d.setDate(d.getDate() - 29); s = d.toISOString().slice(0, 10);
    }
    setDraftStart(s);
    setDraftEnd(todayISO());
  };

  const applyRange = () => {
    setStart(draftStart);
    setEnd(draftEnd);
    setPickerOpen(false);
    setLoading(true);
    load(draftStart, draftEnd);
  };

  const rangeLabel = useMemo(() => `${fmtDate(start)} — ${fmtDate(end)}`, [start, end]);

  const arrival = data?.today_arrival;

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

        {/* Date range selector */}
        <TouchableOpacity
          testID="dashboard-daterange"
          style={styles.rangePill}
          onPress={() => { setDraftStart(start); setDraftEnd(end); setPickerOpen(true); }}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="calendar-range" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rangeLabel}>Report period</Text>
            <Text style={styles.rangeValue}>{rangeLabel}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-down" size={20} color={colors.primary} />
        </TouchableOpacity>

        {loading && !data ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}><ActivityIndicator color={colors.primary} /></View>
        ) : (
          <>
            {/* Today's Arrival of Spices — replaces profit hero */}
            <TouchableOpacity
              testID="dashboard-arrival-card"
              activeOpacity={0.9}
              onPress={() => router.push(`/arrivals?start=${start}&end=${end}`)}
              style={styles.arrivalCard}
            >
              <View style={styles.arrivalTopRow}>
                <View>
                  <Text style={styles.arrivalTitle}>{"Today's Arrival of Spices"}</Text>
                  <Text style={styles.arrivalSub}>Tap to view customer-wise details</Text>
                </View>
                <View style={styles.arrivalIcon}>
                  <MaterialCommunityIcons name="basket-fill" size={30} color="#fff" />
                </View>
              </View>

              <View style={styles.arrivalGrid}>
                <View style={styles.arrivalStat}>
                  <View style={styles.arrivalBadge}>
                    <MaterialCommunityIcons name="arrow-down-bold" size={16} color="#fff" />
                    <Text style={styles.arrivalBadgeText}>IN</Text>
                  </View>
                  <Text style={styles.arrivalValue}>{fmtNum(arrival?.in_weight || 0, "", " kg")}</Text>
                  <Text style={styles.arrivalMeta}>{arrival?.in_count || 0} arrivals</Text>
                </View>

                <View style={styles.arrivalDivider} />

                <View style={styles.arrivalStat}>
                  <View style={[styles.arrivalBadge, { backgroundColor: "rgba(255,255,255,0.28)" }]}>
                    <MaterialCommunityIcons name="arrow-up-bold" size={16} color="#fff" />
                    <Text style={styles.arrivalBadgeText}>OUT</Text>
                  </View>
                  <Text style={styles.arrivalValue}>{fmtNum(arrival?.out_weight || 0, "", " kg")}</Text>
                  <Text style={styles.arrivalMeta}>{arrival?.out_count || 0} deliveries</Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* Period-based metric grid */}
            <View style={styles.sectionRow}>
              <Text style={styles.sectionHeader}>Overview</Text>
              <Text style={styles.sectionHint}>{rangeLabel}</Text>
            </View>
            <View style={styles.grid}>
              <Metric icon="account-multiple-plus" color="#2E7D32" label="Customers" value={fmtNum(data?.period_customers || 0)} testID="metric-customers" />
              <Metric icon="weight-kilogram" color="#1565C0" label="Received" value={fmtNum(data?.period_received_weight || 0, "", " kg")} testID="metric-received" />
              <Metric icon="truck-check" color="#7B1FA2" label="Deliveries" value={fmtNum(data?.period_deliveries || 0)} testID="metric-deliveries" />
              <Metric icon="cash-multiple" color="#43A047" label="Collection" value={fmtNum(data?.period_collection || 0, "₹")} testID="metric-collection" />
              <Metric icon="cash-minus" color="#F57C00" label="Expenses" value={fmtNum(data?.period_expenses || 0, "₹")} testID="metric-expenses" />
              <Metric icon="clock-alert-outline" color="#C62828" label="Pending Dues" value={fmtNum(data?.pending_payments || 0, "₹")} testID="metric-pending" />
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

      {/* Date range picker modal */}
      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Select Date Range</Text>

            <View style={styles.presetsRow}>
              {PRESETS.map(p => (
                <TouchableOpacity
                  key={p.key}
                  testID={`preset-${p.key}`}
                  style={styles.preset}
                  onPress={() => applyPreset(p.key)}
                >
                  <Text style={styles.presetText}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.dateRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dateLabel}>From</Text>
                <TextInput
                  testID="dashboard-start-date"
                  style={styles.dateInput}
                  value={draftStart}
                  onChangeText={setDraftStart}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textLight}
                />
              </View>
              <MaterialCommunityIcons name="arrow-right" size={18} color={colors.textMuted} style={{ marginTop: 18 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.dateLabel}>To</Text>
                <TextInput
                  testID="dashboard-end-date"
                  style={styles.dateInput}
                  value={draftEnd}
                  onChangeText={setDraftEnd}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textLight}
                />
              </View>
            </View>

            <View style={styles.sheetActions}>
              <TouchableOpacity testID="range-cancel" style={styles.sheetCancel} onPress={() => setPickerOpen(false)}>
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="range-apply" style={styles.sheetApply} onPress={applyRange}>
                <Text style={styles.sheetApplyText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Metric({ icon, color, label, value, testID }: any) {
  return (
    <View style={styles.metric} testID={testID}>
      <View style={[styles.metricIcon, { backgroundColor: `${color}18` }]}>
        <MaterialCommunityIcons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
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

  rangePill: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    marginHorizontal: spacing.xl, marginBottom: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    ...shadow.card,
  },
  rangeLabel: { fontSize: 10, fontWeight: "800", color: colors.textMuted, letterSpacing: 0.5, textTransform: "uppercase" },
  rangeValue: { fontSize: 14, fontWeight: "800", color: colors.text, marginTop: 1 },

  arrivalCard: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.primary,
    padding: spacing.xl,
    borderRadius: radius.xxl,
    marginBottom: spacing.lg,
    ...shadow.card,
  },
  arrivalTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  arrivalTitle: { color: "#fff", fontSize: 17, fontWeight: "800", letterSpacing: -0.3 },
  arrivalSub: { color: "#B9F6CA", fontSize: 12, marginTop: 2, fontWeight: "500" },
  arrivalIcon: { width: 56, height: 56, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  arrivalGrid: { flexDirection: "row", alignItems: "center", marginTop: spacing.sm },
  arrivalStat: { flex: 1 },
  arrivalDivider: { width: 1, height: 60, backgroundColor: "rgba(255,255,255,0.25)", marginHorizontal: spacing.md },
  arrivalBadge: { flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-start", backgroundColor: colors.accent, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  arrivalBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  arrivalValue: { color: "#fff", fontSize: 26, fontWeight: "800", marginTop: 8, letterSpacing: -0.5 },
  arrivalMeta: { color: "#E8F5E9", fontSize: 11, marginTop: 2, fontWeight: "600" },

  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, marginBottom: spacing.sm },
  sectionHeader: { fontSize: 15, fontWeight: "800", color: colors.text },
  sectionHint: { fontSize: 11, fontWeight: "700", color: colors.textMuted, letterSpacing: 0.3 },

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

  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, padding: spacing.xl, paddingBottom: spacing.xxl },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: spacing.md },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: colors.text, marginBottom: spacing.md },
  presetsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.lg },
  preset: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.primary50 },
  presetText: { fontSize: 12, fontWeight: "700", color: colors.primary },
  dateRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.lg },
  dateLabel: { fontSize: 11, fontWeight: "800", color: colors.textMuted, marginBottom: 6, letterSpacing: 0.3, textTransform: "uppercase" },
  dateInput: { backgroundColor: colors.bg, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.text, borderWidth: 1, borderColor: colors.border },
  sheetActions: { flexDirection: "row", gap: spacing.md },
  sheetCancel: { flex: 1, paddingVertical: 12, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border, alignItems: "center" },
  sheetCancelText: { color: colors.textMuted, fontWeight: "700" },
  sheetApply: { flex: 2, paddingVertical: 12, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: "center" },
  sheetApplyText: { color: "#fff", fontWeight: "800" },
});
