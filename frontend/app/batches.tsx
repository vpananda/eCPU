import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import Calendar from "@/src/components/Calendar";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { StatusPill } from "@/src/components/ui";

const STATUSES = ["All", "Received", "Loaded", "Drying", "Completed", "Delivered"];

function formatDisplayDateTime(isoStr: string) {
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    let hr = d.getHours();
    const ampm = hr >= 12 ? "PM" : "AM";
    hr = hr % 12;
    hr = hr ? hr : 12;
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${String(hr).padStart(2, "0")}:${min} ${ampm}`;
  } catch {
    return isoStr;
  }
}

export default function BatchesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ status?: string; start?: string; end?: string }>();
  const { user, selectedBranchId } = useAuth();

  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(params.status || "All");

  const [filterOpen, setFilterOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(params.start || "");
  const [draftEnd, setDraftEnd] = useState(params.end || "");

  React.useEffect(() => {
    setDraftStart(params.start || "");
    setDraftEnd(params.end || "");
  }, [params.start, params.end]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filter !== "All") qs.set("status", filter);
      if (selectedBranchId) qs.set("branch_id", selectedBranchId);
      if (params.start) qs.set("start", params.start);
      if (params.end) qs.set("end", params.end);
      
      const path = `/batches?${qs.toString()}`;
      const d = await api<any[]>(path);
      setList(d);
    } finally {
      setLoading(false);
    }
  }, [filter, selectedBranchId, params.start, params.end]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="batches-back">
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.title}>Batches</Text>
          {params.start && params.end && (
            <Text style={styles.subtitle}>{params.start} → {params.end}</Text>
          )}
        </View>
        <TouchableOpacity onPress={() => setFilterOpen(!filterOpen)} testID="batches-filter-toggle">
          <MaterialCommunityIcons name={filterOpen ? "calendar-check" : "calendar-range"} size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Date Filter Bar */}
      {filterOpen && (
        <View style={styles.filterBar}>
          <Calendar
            startDate={draftStart}
            endDate={draftEnd}
            onSelectRange={(s, e) => {
              setDraftStart(s);
              setDraftEnd(e);
              if (s && e) {
                router.setParams({ start: s, end: e });
              }
            }}
          />
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={() => {
              setDraftStart("");
              setDraftEnd("");
              router.setParams({ start: "", end: "" });
            }}
            testID="batches-filter-clear"
          >
            <Text style={styles.clearBtnText}>Clear Filter</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Status Chips Row */}
      <View style={{ marginBottom: spacing.xs, marginTop: spacing.xs }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {STATUSES.map(s => (
            <TouchableOpacity
              key={s}
              testID={`batches-filter-${s.toLowerCase()}`}
              style={[styles.chip, filter === s && styles.chipActive]}
              onPress={() => setFilter(s)}
            >
              <Text style={[styles.chipText, filter === s && { color: "#fff" }]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120, gap: spacing.md }}
          ListEmptyComponent={() => (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="package-variant-closed" size={48} color={colors.textLight} />
              <Text style={styles.emptyText}>No batches found</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`batch-list-${item.id}`}
              style={styles.item}
              onPress={() => router.push(`/batch/${item.id}`)}
              activeOpacity={0.85}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={styles.batchNo}>{item.batch_no}</Text>
                    <StatusPill status={item.status} />
                  </View>
                  <Text style={styles.itemBranchText}>
                    <MaterialCommunityIcons name="map-marker-outline" size={10} color={colors.textMuted} /> {item.branch_name || "Main Branch"}
                  </Text>
                </View>

                <Text style={styles.customerName}>{item.customer?.name || "-"}</Text>

                <View style={styles.metaRow}>
                  <Text style={styles.meta}>
                    {item.product?.name} • {item.raw_weight} KG{item.machine?.name ? ` • Dryer: ${item.machine.name}` : ""}
                  </Text>
                </View>

                <View style={styles.timeRow}>
                  <MaterialCommunityIcons name="clock-outline" size={11} color={colors.textMuted} style={{ marginRight: 4 }} />
                  <Text style={styles.timeText}>
                    Started: {formatDisplayDateTime(item.start_time || item.created_at)}
                  </Text>
                </View>

                <Text style={styles.bill}>
                  ₹{(item.bill_amount || 0).toLocaleString()}
                  {item.balance_amount > 0 ? (
                    <Text style={{ color: colors.accent }}> • Bal ₹{item.balance_amount.toLocaleString()}</Text>
                  ) : null}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textLight} />
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 11, color: colors.textMuted, marginTop: 2, fontWeight: "600" },
  filterBar: {
    backgroundColor: colors.card,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  clearBtn: {
    marginTop: spacing.md,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
  },
  chipsRow: { paddingHorizontal: spacing.xl, gap: 8, paddingVertical: spacing.sm },
  chip: { paddingHorizontal: 16, height: 36, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, justifyContent: "center", flexShrink: 0 },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: "700", color: colors.textMuted },
  empty: { paddingVertical: 60, alignItems: "center", justifyContent: "center" },
  emptyText: { marginTop: spacing.md, fontSize: 14, color: colors.textMuted, fontWeight: "600" },
  item: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    padding: spacing.lg,
    borderRadius: radius.xxl,
    ...shadow.card,
  },
  batchNo: { fontSize: 16, fontWeight: "800", color: colors.text, letterSpacing: -0.2 },
  customerName: { fontSize: 13, color: colors.text, fontWeight: "700", marginTop: 4 },
  metaRow: { marginTop: 4 },
  meta: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  timeRow: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  timeText: { fontSize: 11, color: colors.textMuted, fontWeight: "600" },
  itemBranchText: { fontSize: 11, color: colors.textMuted, fontWeight: "600" },
  bill: { fontSize: 14, fontWeight: "800", color: colors.primary, marginTop: 8 },
});
