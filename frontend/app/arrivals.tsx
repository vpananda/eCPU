import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, radius, shadow, spacing } from "@/src/theme";

type Row = {
  batch_id: string;
  batch_no: string;
  customer_name: string;
  customer_code: string;
  customer_mobile: string;
  product: string;
  branch_id?: string;
  branch_name?: string;
  arrival_date: string;
  raw_weight: number;
  actual_dry_weight: number | null;
  delivery_date: string | null;
  status: string;
};

type Payload = {
  range: { start: string; end: string };
  totals: { in_weight: number; out_weight: number; processing_weight: number; in_count: number; out_count: number; processing_count: number };
  in: Row[];
  out: Row[];
  processing: Row[];
};

function fmtDate(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

const TABS: { key: "in" | "processing" | "out"; label: string; icon: any; color: string }[] = [
  { key: "in", label: "Arrivals", icon: "arrow-down-bold", color: "#2E7D32" },
  { key: "processing", label: "Processing", icon: "cog-play", color: "#F57C00" },
  { key: "out", label: "Delivered", icon: "arrow-up-bold", color: "#7B1FA2" },
];

export default function ArrivalsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ start?: string; end?: string; tab?: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"in" | "processing" | "out">((params.tab as any) || "processing");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (params.start) qs.set("start", String(params.start));
      if (params.end) qs.set("end", String(params.end));
      const d = await api<Payload>(`/dashboard/arrivals?${qs.toString()}`);
      setData(d);
    } finally { setLoading(false); }
  }, [params.start, params.end]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const rows: Row[] = tab === "in" ? data?.in || [] : tab === "out" ? data?.out || [] : data?.processing || [];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="arrivals-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.title}>Processing Details</Text>
          {data?.range && (
            <Text style={styles.subtitle}>{data.range.start} → {data.range.end}</Text>
          )}
        </View>
        <View style={{ width: 22 }} />
      </View>

      {/* Segmented tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
        {TABS.map(t => {
          const active = tab === t.key;
          const count = t.key === "in" ? data?.totals.in_count : t.key === "out" ? data?.totals.out_count : data?.totals.processing_count;
          const weight = t.key === "in" ? data?.totals.in_weight : t.key === "out" ? data?.totals.out_weight : data?.totals.processing_weight;
          return (
            <TouchableOpacity
              key={t.key}
              testID={`arrivals-tab-${t.key}`}
              style={[styles.tab, active && { backgroundColor: t.color, borderColor: t.color }]}
              onPress={() => setTab(t.key)}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name={t.icon} size={16} color={active ? "#fff" : t.color} />
              <View>
                <Text style={[styles.tabLabel, active && { color: "#fff" }]}>{t.label}</Text>
                <Text style={[styles.tabMeta, active && { color: "#E8F5E9" }]}>
                  {count || 0} · {(weight || 0).toLocaleString("en-IN")} kg
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100, gap: spacing.sm }}>
          {rows.length === 0 && (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="inbox-outline" size={48} color={colors.textLight} />
              <Text style={styles.emptyText}>No {tab === "in" ? "arrivals" : tab === "out" ? "deliveries" : "batches in processing"}</Text>
            </View>
          )}
          {rows.map(r => {
            const dateStr = tab === "out" ? r.delivery_date : r.arrival_date;
            const weightVal = tab === "out" ? (r.actual_dry_weight || 0) : r.raw_weight;
            const weightLabel = tab === "out" ? "dried" : "processing";
            const accent = tab === "in" ? colors.primary : tab === "out" ? colors.purple : colors.warning;
            return (
              <TouchableOpacity
                key={r.batch_id}
                testID={`arrival-${r.batch_id}`}
                style={styles.row}
                onPress={() => router.push(`/batch/${r.batch_id}`)}
                activeOpacity={0.85}
              >
                <View style={[styles.avatar, { backgroundColor: accent + "18" }]}>
                  <Text style={[styles.avatarText, { color: accent }]}>{r.customer_name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>{r.customer_name}</Text>
                    <View style={styles.codeChip}>
                      <Text style={styles.codeChipText}>{r.customer_code}</Text>
                    </View>
                  </View>
                  <View style={styles.metaRow}>
                    <MaterialCommunityIcons name="office-building" size={11} color={colors.primary} />
                    <Text style={styles.branchText}>{r.branch_name || "-"}</Text>
                    <Text style={styles.metaDot}>·</Text>
                    <Text style={styles.meta}>{r.product}</Text>
                  </View>
                  <View style={styles.metaRow}>
                    <MaterialCommunityIcons name="calendar" size={11} color={colors.textMuted} />
                    <Text style={styles.meta}>{fmtDate(dateStr)}</Text>
                    <Text style={styles.metaDot}>·</Text>
                    <MaterialCommunityIcons name="phone" size={11} color={colors.textMuted} />
                    <Text style={styles.meta}>{r.customer_mobile}</Text>
                  </View>
                  <Text style={styles.batchNo}>{r.batch_no}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.weight, { color: accent }]}>{weightVal} kg</Text>
                  <Text style={styles.weightLabel}>{weightLabel}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: 18, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 11, color: colors.textMuted, fontWeight: "600", marginTop: 2 },

  tabsRow: { paddingHorizontal: spacing.xl, gap: spacing.sm, paddingVertical: spacing.md },
  tab: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.xl, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border, flexShrink: 0, ...shadow.card },
  tabLabel: { fontSize: 13, fontWeight: "800", color: colors.text },
  tabMeta: { fontSize: 10, fontWeight: "700", color: colors.textMuted, marginTop: 1 },

  row: { flexDirection: "row", alignItems: "flex-start", backgroundColor: colors.card, padding: spacing.md, borderRadius: radius.xl, gap: spacing.md, ...shadow.card },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 17, fontWeight: "800" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontSize: 14, fontWeight: "800", color: colors.text, flexShrink: 1 },
  codeChip: { paddingHorizontal: 6, paddingVertical: 2, backgroundColor: colors.accent + "20", borderRadius: 5 },
  codeChipText: { fontSize: 10, fontWeight: "800", color: colors.accent },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 3 },
  branchText: { fontSize: 11, color: colors.primary, fontWeight: "700" },
  metaDot: { fontSize: 11, color: colors.textLight, marginHorizontal: 2 },
  meta: { fontSize: 11, color: colors.textMuted, fontWeight: "500" },
  batchNo: { fontSize: 10, color: colors.textLight, marginTop: 2, fontWeight: "700", letterSpacing: 0.3 },
  weight: { fontSize: 16, fontWeight: "800" },
  weightLabel: { fontSize: 10, color: colors.textLight, marginTop: 1, letterSpacing: 0.3, textTransform: "uppercase" },

  empty: { alignItems: "center", paddingVertical: 60, gap: 6 },
  emptyText: { fontSize: 14, color: colors.textMuted, fontWeight: "600", marginTop: 12, textAlign: "center" },
});
