import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useSegments } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, radius, shadow, spacing } from "@/src/theme";

export default function Reports() {
  const router = useRouter();
  const segments = useSegments();
  const { selectedBranchId, branches } = useAuth();
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const isTab = (segments as string[]).includes("(tabs)");

  const load = useCallback(async (bid = selectedBranchId) => {
    setLoading(true);
    try {
      const qs = bid ? `?branch_id=${bid}` : "";
      setD(await api<any>(`/reports/summary${qs}`));
    } catch (e) {
      console.error("Reports load failure", e);
    } finally {
      setLoading(false);
    }
  }, [selectedBranchId]);

  useFocusEffect(useCallback(() => { load(selectedBranchId); }, [load, selectedBranchId]));

  useEffect(() => {
    load(selectedBranchId);
  }, [selectedBranchId, load]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={[styles.header, isTab && { paddingHorizontal: spacing.xl, justifyContent: "flex-start", gap: spacing.sm }]}>
        {!isTab && (
          <TouchableOpacity onPress={() => router.back()} testID="reports-back" style={{ marginRight: spacing.sm }}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Reports</Text>
          <Text style={styles.subTitle}>
            {selectedBranchId ? (branches.find(b => b.id === selectedBranchId)?.name || "Branch") : "All Branches"}
          </Text>
        </View>
      </View>

      {loading || !d ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
          {/* Profit card */}
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>Total Profit</Text>
            <Text style={styles.heroValue}>₹{d.profit.toLocaleString("en-IN")}</Text>
            <View style={styles.heroRow}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatLabel}>Collection</Text>
                <Text style={styles.heroStatValue}>₹{d.total_collection.toLocaleString("en-IN")}</Text>
              </View>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatLabel}>Expenses</Text>
                <Text style={styles.heroStatValue}>₹{d.total_expense.toLocaleString("en-IN")}</Text>
              </View>
            </View>
          </View>

          {/* Detailed Expense Report Button */}
          <TouchableOpacity
            testID="reports-expense-detail"
            style={styles.detailBtn}
            onPress={() => router.push("/expense-report")}
            activeOpacity={0.85}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <View style={styles.detailIconWrap}>
                <MaterialCommunityIcons name="file-chart" size={20} color={colors.primary} />
              </View>
              <View style={{ flexShrink: 1 }}>
                <Text style={styles.detailTitle}>Detailed Expense Report</Text>
                <Text style={styles.detailSub}>Filter by date, category, and view receipts</Text>
              </View>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textLight} />
          </TouchableOpacity>

          {/* Outsourced Drying & Payouts Summary */}
          {d.outsourced_summary && (
            <View style={[styles.card, { borderColor: "#FFE082", borderWidth: 1.5, backgroundColor: "#FFFDF7" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "#FFE082", alignItems: "center", justifyContent: "center" }}>
                    <MaterialCommunityIcons name="truck-delivery-outline" size={18} color="#E65100" />
                  </View>
                  <View>
                    <Text style={[styles.sectionTitle, { marginBottom: 0, color: "#E65100" }]}>Outsourced Processing & Payouts</Text>
                    <Text style={{ fontSize: 11, color: colors.textMuted }}>Vendor dryers job-work & settlement</Text>
                  </View>
                </View>
              </View>

              {/* 4 Summary Stats */}
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.md, backgroundColor: "#FFF8E1", padding: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: "#FFE082" }}>
                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: "700", textTransform: "uppercase" }}>Processed</Text>
                  <Text style={{ fontSize: 13, fontWeight: "800", color: "#E65100", marginTop: 2 }}>
                    {Number(d.outsourced_summary.total_kg || 0).toLocaleString("en-IN")} kg
                  </Text>
                </View>
                <View style={{ width: 1, height: 28, backgroundColor: "#FFE082" }} />
                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: "700", textTransform: "uppercase" }}>Total Cost</Text>
                  <Text style={{ fontSize: 13, fontWeight: "800", color: colors.text, marginTop: 2 }}>
                    ₹{Number(d.outsourced_summary.total_cost || 0).toLocaleString("en-IN")}
                  </Text>
                </View>
                <View style={{ width: 1, height: 28, backgroundColor: "#FFE082" }} />
                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: "700", textTransform: "uppercase" }}>Paid</Text>
                  <Text style={{ fontSize: 13, fontWeight: "800", color: colors.success, marginTop: 2 }}>
                    ₹{Number(d.outsourced_summary.total_paid || 0).toLocaleString("en-IN")}
                  </Text>
                </View>
                <View style={{ width: 1, height: 28, backgroundColor: "#FFE082" }} />
                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: "700", textTransform: "uppercase" }}>Balance</Text>
                  <Text style={{ fontSize: 13, fontWeight: "800", color: d.outsourced_summary.balance_payable > 0 ? "#C62828" : colors.success, marginTop: 2 }}>
                    ₹{Number(d.outsourced_summary.balance_payable || 0).toLocaleString("en-IN")}
                  </Text>
                </View>
              </View>

              {/* Vendor Breakdown */}
              {(d.outsourced_summary.machines || []).length === 0 ? (
                <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: "center", paddingVertical: 8 }}>
                  No outsourced dryers configured yet.
                </Text>
              ) : (
                (d.outsourced_summary.machines || []).map((m: any) => (
                  <TouchableOpacity
                    key={m.machine_id}
                    style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#FFE082" }}
                    onPress={() => router.push(`/machine/${m.machine_id}`)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: "800", color: colors.text }}>{m.machine_name}</Text>
                      <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }}>
                        {m.vendor_name} • ₹{m.rate_per_kg}/kg • {m.batches_count} batches
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ fontSize: 13, fontWeight: "800", color: "#E65100" }}>
                        {Number(m.processed_kg || 0).toLocaleString("en-IN")} kg
                      </Text>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: m.balance_payable > 0 ? "#C62828" : colors.success, marginTop: 1 }}>
                        Bal: ₹{Number(m.balance_payable || 0).toLocaleString("en-IN")}
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textLight} style={{ marginLeft: 6 }} />
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {/* Alerts */}
          <View style={styles.alertGrid}>
            <View style={[styles.alert, { backgroundColor: colors.danger + "15" }]}>
              <MaterialCommunityIcons name="clock-alert-outline" size={22} color={colors.danger} />
              <Text style={styles.alertLabel}>Pending Payments</Text>
              <Text style={[styles.alertValue, { color: colors.danger }]}>₹{d.pending_payments.toLocaleString("en-IN")}</Text>
            </View>
            <View style={[styles.alert, { backgroundColor: colors.warning + "15" }]}>
              <MaterialCommunityIcons name="truck-alert-outline" size={22} color={colors.warning} />
              <Text style={styles.alertLabel}>Pending Deliveries</Text>
              <Text style={[styles.alertValue, { color: colors.warning }]}>{d.pending_deliveries}</Text>
            </View>
          </View>

          {/* Machine util */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Machine Utilization</Text>
            {d.machine_utilization.map((m: any) => (
              <View key={m.name} style={styles.utilRow}>
                <MaterialCommunityIcons name="cog" size={18} color={colors.status[m.status] || colors.primary} />
                <Text style={styles.utilName}>{m.name}</Text>
                <View style={styles.utilBar}>
                  <View style={[styles.utilFill, { width: `${Math.min(100, m.batches * 10)}%`, backgroundColor: colors.status[m.status] || colors.primary }]} />
                </View>
                <Text style={styles.utilCount}>{m.batches}</Text>
              </View>
            ))}
          </View>

          {/* Expense by category */}
          {Object.keys(d.expense_by_category || {}).length > 0 && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Expenses by Category</Text>
              {Object.entries(d.expense_by_category).sort(([, a]: any, [, b]: any) => b - a).map(([cat, amt]: any) => (
                <View key={cat} style={styles.catRow}>
                  <Text style={styles.catName}>{cat}</Text>
                  <Text style={styles.catAmt}>₹{amt.toLocaleString("en-IN")}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Overview</Text>
            <View style={styles.overviewRow}><Text style={styles.overviewLabel}>Total Batches</Text><Text style={styles.overviewValue}>{d.total_batches}</Text></View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  subTitle: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  hero: { backgroundColor: colors.primary, marginHorizontal: spacing.xl, borderRadius: radius.xxl, padding: spacing.xl, ...shadow.card, marginBottom: spacing.lg },
  heroLabel: { color: "#B9F6CA", fontSize: 12, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  heroValue: { color: "#fff", fontSize: 32, fontWeight: "800", marginTop: 4 },
  heroRow: { flexDirection: "row", marginTop: spacing.md, gap: spacing.lg },
  heroStat: { flex: 1 },
  heroStatLabel: { color: "#E8F5E9", fontSize: 11, fontWeight: "600" },
  heroStatValue: { color: "#fff", fontSize: 16, fontWeight: "800", marginTop: 2 },
  alertGrid: { flexDirection: "row", paddingHorizontal: spacing.xl, gap: spacing.md, marginBottom: spacing.lg },
  alert: { flex: 1, padding: spacing.lg, borderRadius: radius.xl, gap: 6 },
  alertLabel: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  alertValue: { fontSize: 18, fontWeight: "800" },
  card: { marginHorizontal: spacing.xl, backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md, ...shadow.card },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.text, marginBottom: spacing.md },
  utilRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: spacing.sm },
  utilName: { width: 70, fontSize: 13, color: colors.text, fontWeight: "600" },
  utilBar: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: "hidden" },
  utilFill: { height: "100%" },
  utilCount: { fontSize: 13, fontWeight: "800", color: colors.text, width: 30, textAlign: "right" },
  catRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  catName: { fontSize: 13, color: colors.text, fontWeight: "600" },
  catAmt: { fontSize: 13, color: colors.accent, fontWeight: "800" },
  overviewRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  overviewLabel: { fontSize: 13, color: colors.textMuted },
  overviewValue: { fontSize: 15, color: colors.text, fontWeight: "800" },
  detailBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.card, marginHorizontal: spacing.xl, padding: spacing.md, borderRadius: radius.xl, marginBottom: spacing.lg, ...shadow.card },
  detailIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary50, alignItems: "center", justifyContent: "center" },
  detailTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  detailSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
});
