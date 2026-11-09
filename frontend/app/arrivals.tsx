import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Modal, Alert } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { openWhatsApp, buildArrivalMessage } from "@/src/utils/notifications";
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
  rate_per_kg?: number;
  bill_amount?: number;
  total_paid?: number;
  balance_amount?: number;
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
  const params = useLocalSearchParams<{ start?: string; end?: string; tab?: string; q?: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(params.q || "");
  const [tab, setTab] = useState<"in" | "processing" | "out">((params.tab as any) || "in");

  const [start, setStart] = useState<string>(params.start || "");
  const [end, setEnd] = useState<string>(params.end || "");
  const [activePreset, setActivePreset] = useState<string>(params.start ? "custom" : "all");

  const [filterOpen, setFilterOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(start);
  const [draftEnd, setDraftEnd] = useState(end);

  const [completeBatch, setCompleteBatch] = useState<Row | null>(null);
  const [compDryWeight, setCompDryWeight] = useState("");
  const [compPadiWeight, setCompPadiWeight] = useState("");
  const [compBags, setCompBags] = useState("");
  const [completing, setCompleting] = useState(false);

  const openCompleteModal = (r: Row) => {
    setCompleteBatch(r);
    setCompDryWeight("");
    setCompPadiWeight("");
    setCompBags("");
  };

  const handleCompleteSubmit = async () => {
    if (!completeBatch) return;
    const dry = parseFloat(compDryWeight);
    if (!dry || dry <= 0) {
      Alert.alert("Invalid Input", "Please enter a valid processed dry weight.");
      return;
    }
    const padi = parseFloat(compPadiWeight || "0");
    const bagsNum = parseInt(compBags || "0", 10);
    setCompleting(true);
    try {
      await api(`/batches/${completeBatch.batch_id}/status`, {
        method: "PUT",
        body: {
          status: "Completed",
          actual_dry_weight: dry,
          padi_weight: isNaN(padi) ? 0 : padi,
          processed_bags: isNaN(bagsNum) ? 0 : bagsNum,
        },
      });
      Alert.alert("Success", `Batch ${completeBatch.batch_no} marked Completed & WhatsApp alert sent to ${completeBatch.customer_name}!`);
      setCompleteBatch(null);
      await load();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to complete processing");
    } finally {
      setCompleting(false);
    }
  };

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

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (start) qs.set("start", start);
      if (end) qs.set("end", end);
      if (selectedBranchId) qs.set("branch_id", selectedBranchId);
      if (search.trim()) qs.set("q", search.trim());
      const d = await api<Payload>(`/dashboard/arrivals?${qs.toString()}`);
      setData(d);
      storage.setItem("cached_arrivals_dashboard", d);
    } finally { setLoading(false); }
  }, [start, end, selectedBranchId, search]);

  useFocusEffect(useCallback(() => { load(!!data); }, [load, !!data]));

    const shareArrivalWhatsApp = async (r: Row) => {
    const msg = buildArrivalMessage({
      companyName: "E3 SPICE PROCESSORS",
      branchName: r.branch_name || "Factory",
      customerName: r.customer_name,
      batchNo: r.batch_no,
      date: fmtDate(r.arrival_date),
      productName: r.product || "Cardamom",
      rawWeight: r.raw_weight,
      ratePerKg: r.rate_per_kg || 12,
    });
    await openWhatsApp(r.customer_mobile || "", msg);
  };

  const rows: Row[] = tab === "in" ? data?.in || [] : tab === "out" ? data?.out || [] : data?.processing || [];

  return (
    <View style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="arrivals-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.title}>Customer Arrivals & Processing</Text>
          {data?.range && (
            <Text style={styles.subtitle}>{data.range.start} → {data.range.end}</Text>
          )}
        </View>
        <View style={{ width: 22 }} />
      </View>

      {/* Customer & Batch Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search spice, customer name, code, phone, batch #..."
            placeholderTextColor={colors.textLight}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch("")}>
              <MaterialCommunityIcons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
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
              <TouchableOpacity
                key={r.batch_id}
                testID={`arrival-${r.batch_id}`}
                style={styles.rowCard}
                onPress={() => router.push(`/batch/${r.batch_id}`)}
                activeOpacity={0.85}
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

                {/* Ledger Financials if available */}
                {(r.bill_amount !== undefined && r.bill_amount > 0) ? (
                  <View style={styles.ledgerRow}>
                    <Text style={styles.ledgerBill}>Billed: ₹{r.bill_amount.toLocaleString()}{r.rate_per_kg ? ` (@ ₹${r.rate_per_kg}/kg)` : ""}</Text>
                    <Text style={styles.ledgerPaid}>• Recv: ₹{(r.total_paid || 0).toLocaleString()}</Text>
                    {(r.balance_amount || 0) > 0 ? (
                      <Text style={styles.ledgerBal}>• Bal ₹{(r.balance_amount || 0).toLocaleString()}</Text>
                    ) : (
                      <Text style={styles.ledgerPaidOk}>• Paid ✓</Text>
                    )}
                  </View>
                ) : null}

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

                {isProcessingTab && (
                  <TouchableOpacity
                    style={styles.cardCompleteBtn}
                    onPress={() => openCompleteModal(r)}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name="check-circle" size={14} color="#fff" />
                    <Text style={styles.cardCompleteBtnText}>Complete Processing</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Complete Processing Modal */}
      <Modal visible={!!completeBatch} transparent animationType="fade" onRequestClose={() => setCompleteBatch(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Complete Processing</Text>
                <Text style={styles.modalSubTitle}>
                  {completeBatch?.batch_no} • {completeBatch?.customer_name}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setCompleteBatch(null)}>
                <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Arrival Reference Info */}
            <View style={styles.refInfoBox}>
              <View style={{ flex: 1 }}>
                <Text style={styles.refLabel}>ARRIVAL WET WEIGHT</Text>
                <Text style={styles.refVal}>{completeBatch?.raw_weight || 0} KG</Text>
              </View>
              {completeBatch?.machine_name ? (
                <View style={{ flex: 1 }}>
                  <Text style={styles.refLabel}>MACHINE</Text>
                  <Text style={styles.refVal}>{completeBatch.machine_name}</Text>
                </View>
              ) : null}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 300 }}>
              <Text style={styles.inputTitle}>Processed Dry Weight (KG) *</Text>
              <TextInput
                style={styles.dialogInput}
                value={compDryWeight}
                onChangeText={setCompDryWeight}
                keyboardType="decimal-pad"
                placeholder="e.g. 112.5"
                placeholderTextColor={colors.textLight}
              />

              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputTitle}>Padi Weight (KG)</Text>
                  <TextInput
                    style={styles.dialogInput}
                    value={compPadiWeight}
                    onChangeText={setCompPadiWeight}
                    keyboardType="decimal-pad"
                    placeholder="e.g. 5.2"
                    placeholderTextColor={colors.textLight}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputTitle}>Dry Bags</Text>
                  <TextInput
                    style={styles.dialogInput}
                    value={compBags}
                    onChangeText={setCompBags}
                    keyboardType="number-pad"
                    placeholder="e.g. 2"
                    placeholderTextColor={colors.textLight}
                  />
                </View>
              </View>

              {/* Live Calculation Preview */}
              {parseFloat(compDryWeight || "0") > 0 && (
                <View style={styles.calcSummaryBox}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                    <Text style={styles.calcLabel}>Total Output (Dry + Padi):</Text>
                    <Text style={styles.calcVal}>
                      {(parseFloat(compDryWeight || "0") + parseFloat(compPadiWeight || "0")).toFixed(2)} KG
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={styles.calcLabel}>Weight Loss (Moisture):</Text>
                    <Text style={[styles.calcVal, { color: colors.warning }]}>
                      {Math.max(0, (completeBatch?.raw_weight || 0) - (parseFloat(compDryWeight || "0") + parseFloat(compPadiWeight || "0"))).toFixed(2)} KG
                      {" "}({(((completeBatch?.raw_weight || 0) - (parseFloat(compDryWeight || "0") + parseFloat(compPadiWeight || "0"))) / (completeBatch?.raw_weight || 1) * 100).toFixed(1)}%)
                    </Text>
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setCompleteBatch(null)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleCompleteSubmit}
                disabled={completing}
              >
                {completing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalSubmitText}>Complete & Notify</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: 18, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 11, color: colors.textMuted, fontWeight: "600", marginTop: 2 },
  searchContainer: { paddingHorizontal: spacing.xl, paddingVertical: spacing.xs },
  searchBox: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, gap: 6, ...shadow.sm },
  searchInput: { flex: 1, fontSize: 13, color: colors.text, padding: 0 },
  ledgerRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4, marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border + "60" },
  ledgerBill: { fontSize: 12, fontWeight: "700", color: colors.text },
  ledgerPaid: { fontSize: 12, fontWeight: "700", color: colors.success },
  ledgerBal: { fontSize: 12, fontWeight: "800", color: colors.accent },
  ledgerPaidOk: { fontSize: 12, fontWeight: "700", color: colors.success },
  
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
  waArrivalBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#25D366", alignItems: "center", justifyContent: "center" },

  cardCompleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#F57C00",
    paddingVertical: 9,
    borderRadius: radius.md,
    marginTop: 10,
    ...shadow.sm,
  },
  cardCompleteBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: radius.xl,
    padding: spacing.xl,
    width: "100%",
    ...shadow.card,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.text,
  },
  modalSubTitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    fontWeight: "600",
  },
  refInfoBox: {
    flexDirection: "row",
    backgroundColor: "#FFF7ED",
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#FED7AA",
    marginBottom: spacing.md,
  },
  refLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#9A3412",
    letterSpacing: 0.5,
  },
  refVal: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
    marginTop: 2,
  },
  inputTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textMuted,
    marginBottom: 6,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  dialogInput: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    fontWeight: "700",
  },
  calcSummaryBox: {
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: spacing.md,
  },
  calcLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  calcVal: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
  },
  modalBtnRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelText: {
    color: colors.textMuted,
    fontWeight: "700",
    fontSize: 13,
  },
  modalSubmitBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: "#F57C00",
    alignItems: "center",
    justifyContent: "center",
    ...shadow.sm,
  },
  modalSubmitText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
  },
});
