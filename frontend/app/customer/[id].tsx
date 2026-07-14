import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { StatusPill } from "@/src/components/ui";

export default function CustomerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const d = await api<any>(`/customers/${id}`);
      setData(d);
    } finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading || !data) {
    return <SafeAreaView style={styles.safe}><ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} /></SafeAreaView>;
  }

  const s = data.stats || {};

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="customer-detail-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Customer</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.hero}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{data.name.slice(0, 1).toUpperCase()}</Text></View>
          <Text style={styles.name}>{data.name}</Text>
          <View style={styles.codePill}><Text style={styles.codeText}>{data.code}</Text></View>
          <Text style={styles.mobile}>{data.mobile}</Text>
          {data.village || data.district ? (
            <Text style={styles.location}>
              <MaterialCommunityIcons name="map-marker" size={12} color={colors.textMuted} /> {[data.village, data.taluk, data.district].filter(Boolean).join(", ")}
            </Text>
          ) : null}
          {data.branch_name && data.branch_name !== "-" ? (
            <Text style={styles.branch}>
              <MaterialCommunityIcons name="storefront" size={12} color={colors.primary} /> {data.branch_name}
            </Text>
          ) : null}
        </View>

        <View style={styles.statsGrid}>
          <Stat label="Visits" value={String(s.total_visits || 0)} icon="calendar-check" />
          <Stat label="Total Weight" value={`${(s.total_weight || 0).toFixed(0)}kg`} icon="weight-kilogram" />
          <Stat label="Revenue" value={`₹${(s.total_revenue || 0).toFixed(0)}`} icon="currency-inr" />
          <Stat label="Pending" value={`₹${(s.pending_balance || 0).toFixed(0)}`} icon="clock-alert-outline" danger={(s.pending_balance || 0) > 0} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>History</Text>
          {(data.history || []).length === 0 && <Text style={styles.empty}>No batches yet</Text>}
          {(data.history || []).map((b: any) => (
            <TouchableOpacity key={b.id} testID={`history-batch-${b.id}`} style={styles.batchRow} onPress={() => router.push(`/batch/${b.id}`)}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.batchNo}>{b.batch_no}</Text>
                  <StatusPill status={b.status} />
                </View>
                <Text style={styles.batchMeta}>{b.raw_weight}kg · ₹{b.bill_amount?.toFixed(0)} · Bal ₹{b.balance_amount?.toFixed(0)}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textLight} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, icon, danger }: any) {
  return (
    <View style={styles.stat}>
      <MaterialCommunityIcons name={icon} size={18} color={danger ? colors.danger : colors.primary} />
      <Text style={[styles.statValue, danger && { color: colors.danger }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { fontSize: 18, fontWeight: "800", color: colors.text },
  hero: { alignItems: "center", padding: spacing.xl, gap: 4 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  avatarText: { fontSize: 32, fontWeight: "800", color: "#fff" },
  name: { fontSize: 22, fontWeight: "800", color: colors.text },
  codePill: { paddingHorizontal: 10, paddingVertical: 3, backgroundColor: colors.accent + "20", borderRadius: radius.pill, marginTop: 6 },
  codeText: { fontSize: 12, fontWeight: "800", color: colors.accent },
  mobile: { fontSize: 14, color: colors.textMuted, marginTop: 6 },
  location: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  branch: { fontSize: 12, color: colors.primary, fontWeight: "700", marginTop: 4 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: spacing.xl, gap: spacing.md, marginBottom: spacing.lg },
  stat: { width: "47.5%", backgroundColor: colors.card, padding: spacing.lg, borderRadius: radius.xl, ...shadow.card, gap: 4 },
  statValue: { fontSize: 18, fontWeight: "800", color: colors.text },
  statLabel: { fontSize: 12, color: colors.textMuted },
  section: { marginHorizontal: spacing.xl, backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.lg, ...shadow.card },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.text, marginBottom: spacing.md },
  empty: { fontSize: 13, color: colors.textMuted, textAlign: "center", paddingVertical: spacing.md },
  batchRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  batchNo: { fontSize: 14, fontWeight: "800", color: colors.text },
  batchMeta: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
});
