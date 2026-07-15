import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useSegments } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, radius, shadow, spacing } from "@/src/theme";

export default function Reports() {
  const router = useRouter();
  const segments = useSegments();
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const isTab = (segments as string[]).includes("(tabs)");

  const load = useCallback(async () => {
    try { setD(await api<any>("/reports/summary")); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={[styles.header, isTab && { paddingHorizontal: spacing.xl, justifyContent: "flex-start", gap: spacing.sm }]}>
        {!isTab && (
          <TouchableOpacity onPress={() => router.back()} testID="reports-back">
            <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
          </TouchableOpacity>
        )}
        <Text style={styles.title}>Reports</Text>
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
});
