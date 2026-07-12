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
  arrival_date: string;
  raw_weight: number;
  actual_dry_weight: number | null;
  delivery_date: string | null;
  status: string;
};

type Payload = {
  range: { start: string; end: string };
  totals: { in_weight: number; out_weight: number; in_count: number; out_count: number };
  in: Row[];
  out: Row[];
};

function fmtDate(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" }) +
    " · " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export default function ArrivalsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ start?: string; end?: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"in" | "out">("in");

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

  const rows: Row[] = tab === "in" ? data?.in || [] : data?.out || [];
  const totalIn = data?.totals.in_weight || 0;
  const totalOut = data?.totals.out_weight || 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="arrivals-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.title}>Arrival of Spices</Text>
          {data?.range && (
            <Text style={styles.subtitle}>{data.range.start} → {data.range.end}</Text>
          )}
        </View>
        <View style={{ width: 22 }} />
      </View>

      {/* Totals card */}
      <View style={styles.totals}>
        <TouchableOpacity
          testID="arrivals-tab-in"
          style={[styles.totalBox, tab === "in" && styles.totalBoxActive]}
          onPress={() => setTab("in")}
          activeOpacity={0.85}
        >
          <View style={styles.totalBadge}>
            <MaterialCommunityIcons name="arrow-down-bold" size={14} color="#fff" />
            <Text style={styles.totalBadgeText}>IN</Text>
          </View>
          <Text style={styles.totalValue}>{totalIn.toLocaleString("en-IN", { maximumFractionDigits: 2 })} kg</Text>
          <Text style={styles.totalMeta}>{data?.totals.in_count || 0} arrivals</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="arrivals-tab-out"
          style={[styles.totalBox, tab === "out" && styles.totalBoxActive]}
          onPress={() => setTab("out")}
          activeOpacity={0.85}
        >
          <View style={[styles.totalBadge, { backgroundColor: colors.accent }]}>
            <MaterialCommunityIcons name="arrow-up-bold" size={14} color="#fff" />
            <Text style={styles.totalBadgeText}>OUT</Text>
          </View>
          <Text style={styles.totalValue}>{totalOut.toLocaleString("en-IN", { maximumFractionDigits: 2 })} kg</Text>
          <Text style={styles.totalMeta}>{data?.totals.out_count || 0} deliveries</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100, gap: spacing.sm }}>
          {rows.length === 0 && (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="inbox-outline" size={48} color={colors.textLight} />
              <Text style={styles.emptyText}>No {tab === "in" ? "arrivals" : "deliveries"} in this period</Text>
            </View>
          )}
          {rows.map(r => (
            <TouchableOpacity
              key={r.batch_id}
              testID={`arrival-${r.batch_id}`}
              style={styles.row}
              onPress={() => router.push(`/batch/${r.batch_id}`)}
              activeOpacity={0.85}
            >
              <View style={[styles.avatar, tab === "out" && { backgroundColor: colors.accent + "20" }]}>
                <Text style={[styles.avatarText, tab === "out" && { color: colors.accent }]}>{r.customer_name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>{r.customer_name}</Text>
                  <View style={styles.codeChip}>
                    <Text style={styles.codeChipText}>{r.customer_code}</Text>
                  </View>
                </View>
                <Text style={styles.meta}>
                  <MaterialCommunityIcons name="phone" size={11} color={colors.textMuted} /> {r.customer_mobile}
                  {"  ·  "}{r.product}  ·  {r.batch_no}
                </Text>
                <Text style={styles.date}>
                  {tab === "in" ? "Received: " : "Delivered: "}
                  {tab === "in" ? fmtDate(r.arrival_date) : fmtDate(r.delivery_date)}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.weight, { color: tab === "in" ? colors.primary : colors.accent }]}>
                  {tab === "in" ? r.raw_weight : (r.actual_dry_weight || 0)} kg
                </Text>
                <Text style={styles.weightLabel}>{tab === "in" ? "raw" : "dried"}</Text>
              </View>
            </TouchableOpacity>
          ))}
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

  totals: { flexDirection: "row", paddingHorizontal: spacing.xl, gap: spacing.md, marginTop: spacing.md, marginBottom: spacing.lg },
  totalBox: { flex: 1, padding: spacing.lg, borderRadius: radius.xxl, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border, ...shadow.card },
  totalBoxActive: { borderColor: colors.primary },
  totalBadge: { flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-start", backgroundColor: colors.primary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  totalBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  totalValue: { fontSize: 20, fontWeight: "800", color: colors.text, marginTop: 8, letterSpacing: -0.4 },
  totalMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2, fontWeight: "600" },

  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, padding: spacing.md, borderRadius: radius.xl, gap: spacing.md, ...shadow.card },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary50, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 17, fontWeight: "800", color: colors.primary },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontSize: 14, fontWeight: "700", color: colors.text, flexShrink: 1 },
  codeChip: { paddingHorizontal: 6, paddingVertical: 2, backgroundColor: colors.accent + "20", borderRadius: 5 },
  codeChipText: { fontSize: 10, fontWeight: "800", color: colors.accent },
  meta: { fontSize: 11, color: colors.textMuted, marginTop: 3 },
  date: { fontSize: 11, color: colors.textLight, marginTop: 2, fontWeight: "500" },
  weight: { fontSize: 15, fontWeight: "800" },
  weightLabel: { fontSize: 10, color: colors.textLight, marginTop: 1, letterSpacing: 0.3, textTransform: "uppercase" },

  empty: { alignItems: "center", paddingVertical: 60, gap: 6 },
  emptyText: { fontSize: 14, color: colors.textMuted, fontWeight: "600", marginTop: 12 },
});
