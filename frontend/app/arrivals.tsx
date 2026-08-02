import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, radius, shadow, spacing } from "@/src/theme";
import Calendar from "@/src/components/Calendar";
import { storage } from "@/src/utils/storage";

type Row = {
  batch_id: string;
  batch_no: string;
  customer_name: string;
  customer_code: string;
  customer_mobile: string;
  product: string;
  machine_name?: string;
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

function todayISO() { return new Date().toISOString().slice(0, 10); }
function yesterdayISO() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
function weekStartISO() {
  const d = new Date(); d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}
function monthStartISO() {
  const d = new Date(); d.setDate(1);
  return d.toISOString().slice(0, 10);
}

const DATE_PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "all", label: "All Time" },
];

const TABS: { key: "in" | "processing" | "out"; label: string; icon: any; color: string }[] = [
  { key: "in", label: "Arrivals", icon: "arrow-down-bold", color: "#2E7D32" },
  { key: "processing", label: "Processing", icon: "cog-play", color: "#F57C00" },
  { key: "out", label: "Delivered", icon: "arrow-up-bold", color: "#7B1FA2" },
];

export default function ArrivalsScreen() {
  const { selectedBranchId } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ start?: string; end?: string; tab?: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"in" | "processing" | "out">((params.tab as any) || "processing");

  const [start, setStart] = useState<string>(params.start || todayISO());
  const [end, setEnd] = useState<string>(params.end || todayISO());
  const [activePreset, setActivePreset] = useState<string>(params.start ? "custom" : "today");

  const [filterOpen, setFilterOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(start);
  const [draftEnd, setDraftEnd] = useState(end);

  const applyPreset = (key: string) => {
    setActivePreset(key);
    if (key === "today") {
      setStart(todayISO());
      setEnd(todayISO());
    } else if (key === "yesterday") {
      setStart(yesterdayISO());
      setEnd(yesterdayISO());
    } else if (key === "week") {
      setStart(weekStartISO());
      setEnd(todayISO());
    } else if (key === "month") {
      setStart(monthStartISO());
      setEnd(todayISO());
    } else if (key === "all") {
      setStart("");
      setEnd("");
    }
  };

  useEffect(() => {
    async function loadFromCache() {
      const cached = await storage.getItem<Payload | null>("cached_arrivals_dashboard", null);
      if (cached) {
        setData(cached);
        setLoading(false);
      }
    }
    loadFromCache();
  }, []);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (start) qs.set("start", start);
      if (end) qs.set("end", end);
      if (selectedBranchId) qs.set("branch_id", selectedBranchId);
      const d = await api<Payload>(`/dashboard/arrivals?${qs.toString()}`);
      setData(d);
      storage.setItem("cached_arrivals_dashboard", d);
    } finally { setLoading(false); }
  }, [start, end, selectedBranchId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const rows: Row[] = tab === "in" ? data?.in || [] : tab === "out" ? data?.out || [] : data?.processing || [];

  return (
    <View style={styles.safe}>
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

      {/* Date Presets Row */}
      <View style={styles.dateFilterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateScroll}>
          {DATE_PRESETS.map(p => (
            <TouchableOpacity
              key={p.key}
              onPress={() => applyPreset(p.key)}
              style={[styles.datePill, activePreset === p.key && styles.datePillActive]}
              activeOpacity={0.8}
            >
              <Text style={[styles.datePillText, activePreset === p.key && styles.datePillTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={() => setFilterOpen(!filterOpen)}
            style={[styles.datePill, activePreset === "custom" && styles.datePillActive]}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="calendar-range" size={14} color={activePreset === "custom" ? "#fff" : colors.textMuted} style={{ marginRight: 4 }} />
            <Text style={[styles.datePillText, activePreset === "custom" && styles.datePillTextActive]}>
              Custom
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {filterOpen && (
        <View style={styles.filterBar}>
          <Calendar
            startDate={draftStart || start}
            endDate={draftEnd || end}
            onSelectRange={(s, e) => {
              setDraftStart(s);
              setDraftEnd(e);
            }}
          />
          <View style={styles.filterActions}>
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={() => {
                applyPreset("all");
                setFilterOpen(false);
              }}
              testID="arrivals-filter-clear"
            >
              <Text style={styles.clearBtnText}>Clear (All Time)</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.applyBtn}
              onPress={() => {
                if (draftStart) {
                  setStart(draftStart);
                  setEnd(draftEnd || draftStart);
                  setActivePreset("custom");
                }
                setFilterOpen(false);
              }}
              testID="arrivals-filter-apply"
            >
              <Text style={styles.applyBtnText}>Apply Filter</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Summary KPI Cards Row */}
      <View style={styles.summaryRow}>
        {TABS.map(t => {
          const active = tab === t.key;
          const count = t.key === "in" ? data?.totals.in_count : t.key === "out" ? data?.totals.out_count : data?.totals.processing_count;
          const weight = t.key === "in" ? data?.totals.in_weight : t.key === "out" ? data?.totals.out_weight : data?.totals.processing_weight;
          return (
            <TouchableOpacity
              key={t.key}
              testID={`arrivals-tab-${t.key}`}
              style={[styles.summaryCard, active && { backgroundColor: t.color, borderColor: t.color }]}
              onPress={() => setTab(t.key)}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name={t.icon} size={18} color={active ? "#fff" : t.color} />
              <Text style={[styles.summaryCardLabel, active && { color: "#fff" }]}>{t.label}</Text>
              <Text style={[styles.summaryCardMeta, active && { color: "#ffffffd0" }]}>
                {count || 0} - {(weight || 0).toLocaleString("en-IN")} kg
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

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
            const isProcessingTab = tab === "processing";
            return (
              <View
                key={r.batch_id}
                testID={`arrival-${r.batch_id}`}
                style={styles.rowCard}
              >
                <View style={styles.cardTopRow}>
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
                      <Text style={styles.meta}>{r.product}</Text>
                      <Text style={styles.metaDot}>·</Text>
                      <MaterialCommunityIcons name="calendar" size={11} color={colors.textMuted} />
                      <Text style={styles.meta}>{fmtDate(dateStr)}</Text>
                    </View>

                    <View style={styles.metaRow}>
                      <MaterialCommunityIcons name="phone" size={11} color={colors.textMuted} />
                      <Text style={styles.meta}>{r.customer_mobile}</Text>
                      <Text style={styles.metaDot}>·</Text>
                      <Text style={styles.batchNo}>{r.batch_no}</Text>
                    </View>
                  </View>

                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.weight, { color: accent }]}>{weightVal} kg</Text>
                    <Text style={styles.weightLabel}>{weightLabel}</Text>
                  </View>
                </View>

                {/* Last Line: Branch Name on Left, Machine Name on Right */}
                <View style={styles.cardBottomRow}>
                  <View style={styles.bottomMetaItem}>
                    <MaterialCommunityIcons name="office-building" size={12} color={colors.primary} />
                    <Text style={styles.branchText}>{r.branch_name || "-"}</Text>
                  </View>

                  {r.machine_name ? (
                    <View style={styles.machineBadgeRight}>
                      <MaterialCommunityIcons name="generator-portable" size={12} color={colors.warning} />
                      <Text style={styles.machineTextRight} numberOfLines={1}>{r.machine_name}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: 18, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 11, color: colors.textMuted, fontWeight: "600", marginTop: 2 },
  
  dateFilterContainer: { paddingBottom: spacing.xs },
  dateScroll: { paddingHorizontal: spacing.xl, gap: spacing.xs, alignItems: "center" },
  datePill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  datePillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  datePillText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
  },
  datePillTextActive: {
    color: "#ffffff",
  },
  filterBar: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  clearBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  clearBtnText: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  applyBtn: { flex: 2, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  applyBtnText: { color: "#fff", fontSize: 13, fontWeight: "800" },

  summaryRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  summaryCard: { flex: 1, padding: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", gap: 3, ...shadow.card },
  summaryCardLabel: { fontSize: 12, fontWeight: "800", color: colors.text },
  summaryCardMeta: { fontSize: 10, fontWeight: "700", color: colors.textMuted },

  tabsContainer: { flexGrow: 0 },
  tabsRow: { paddingHorizontal: spacing.xl, gap: spacing.sm, paddingVertical: spacing.md },
  tab: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.xl, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border, flexShrink: 0, ...shadow.card },
  tabLabel: { fontSize: 13, fontWeight: "800", color: colors.text },
  tabMeta: { fontSize: 10, fontWeight: "700", color: colors.textMuted, marginTop: 1 },

  rowCard: { backgroundColor: colors.card, padding: spacing.md, borderRadius: radius.xl, gap: spacing.xs, ...shadow.card },
  cardTopRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  cardBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border + "60",
  },
  bottomMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 17, fontWeight: "800" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontSize: 14, fontWeight: "800", color: colors.text, flexShrink: 1 },
  codeChip: { paddingHorizontal: 6, paddingVertical: 2, backgroundColor: colors.accent + "20", borderRadius: 5 },
  codeChipText: { fontSize: 10, fontWeight: "800", color: colors.accent },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 3 },
  branchText: { fontSize: 11, color: colors.primary, fontWeight: "700" },
  machineText: { fontSize: 11, color: colors.warning, fontWeight: "800" },
  metaDot: { fontSize: 11, color: colors.textLight, marginHorizontal: 2 },
  meta: { fontSize: 11, color: colors.textMuted, fontWeight: "500" },
  batchNo: { fontSize: 10, color: colors.textLight, marginTop: 2, fontWeight: "700", letterSpacing: 0.3 },
  weight: { fontSize: 16, fontWeight: "800" },
  weightLabel: { fontSize: 10, color: colors.textLight, marginTop: 1, letterSpacing: 0.3, textTransform: "uppercase" },
  machineBadgeRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.warning + "18",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  machineTextRight: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.warning,
  },

  empty: { alignItems: "center", paddingVertical: 60, gap: 6 },
  emptyText: { fontSize: 14, color: colors.textMuted, fontWeight: "600", marginTop: 12, textAlign: "center" },
});
