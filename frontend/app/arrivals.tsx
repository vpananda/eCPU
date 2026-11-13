import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Modal, Alert, RefreshControl } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { openWhatsApp, buildArrivalMessage } from "@/src/utils/notifications";
import Calendar from "@/src/components/Calendar";
import { storage } from "@/src/utils/storage";
import { useSyncRefresh } from "@/src/sync";
import Loader from "@/src/components/Loader";

type SubBatch = {
  batch_id: string;
  batch_no: string;
  raw_weight: number;
  machine_id?: string;
  machine_name?: string;
  status: string;
  actual_dry_weight?: number | null;
  arrival_date?: string;
  processing_started_at?: string | null;
  processing_ended_at?: string | null;
  delivery_date?: string | null;
};

type Row = {
  batch_id: string;
  batch_no: string;
  customer_name: string;
  customer_code: string;
  customer_mobile: string;
  product: string;
  machine_id?: string;
  machine_name?: string;
  branch_id?: string;
  branch_name?: string;
  arrival_date: string;
  processing_started_at?: string | null;
  processing_ended_at?: string | null;
  raw_weight: number;
  rate_per_kg?: number;
  bill_amount?: number;
  total_paid?: number;
  balance_amount?: number;
  actual_dry_weight: number | null;
  padi_weight?: number;
  processed_bags?: number;
  delivery_date: string | null;
  status: string;
  is_split?: boolean;
  sub_batches?: SubBatch[];
  total_arrival_weight?: number;
  split_count?: number;
  other_lots_summary?: string;
  machine_total_weight?: number;
  machine_batch_count?: number;
};

type ProcessingMachine = {
  machine_id: string;
  machine_name: string;
  total_weight: number;
  batch_count: number;
  batches: Row[];
};

type Payload = {
  range: { start: string; end: string };
  totals: {
    in_weight: number;
    out_weight: number;
    processing_weight: number;
    in_count: number;
    out_count: number;
    processing_count: number;
    processing_machine_count?: number;
    completed_count?: number;
    completed_weight?: number;
  };
  in: Row[];
  out: Row[];
  processing: Row[];
  completed?: Row[];
  processing_machines?: ProcessingMachine[];
};

function fmtDate(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  const dateStr = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
  const timeStr = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${dateStr}, ${timeStr}`;
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

let cachedMemoryArrivals: Payload | null = null;

export default function ArrivalsScreen() {
  const { selectedBranchId } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ start?: string; end?: string; tab?: string; q?: string; preset?: string }>();
  const [data, setData] = useState<Payload | null>(cachedMemoryArrivals);
  const [loading, setLoading] = useState(!cachedMemoryArrivals);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState(params.q || "");
  const [tab, setTab] = useState<"in" | "processing" | "out">((params.tab as any) || "in");
  const [procSubTab, setProcSubTab] = useState<"active" | "completed">("active");

  const resolveDatesFromParams = useCallback(() => {
    let s = "";
    let e = "";
    let p = "all";
    if (params.preset) {
      p = params.preset;
      if (params.preset === "today") {
        s = todayISO();
        e = todayISO();
      } else if (params.preset === "yesterday") {
        s = yesterdayISO();
        e = yesterdayISO();
      } else if (params.preset === "week") {
        s = weekStartISO();
        e = todayISO();
      } else if (params.preset === "month") {
        s = monthStartISO();
        e = todayISO();
      } else if (params.preset === "all") {
        s = "";
        e = "";
      } else {
        s = params.start || "";
        e = params.end || "";
        p = "custom";
      }
    } else if (params.start || params.end) {
      s = params.start || "";
      e = params.end || "";
      p = "custom";
    }
    return { s, e, p };
  }, [params.preset, params.start, params.end]);

  const initialDates = resolveDatesFromParams();
  const [start, setStart] = useState<string>(initialDates.s);
  const [end, setEnd] = useState<string>(initialDates.e);
  const [activePreset, setActivePreset] = useState<string>(initialDates.p);

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
    setCompDryWeight(r.actual_dry_weight ? String(r.actual_dry_weight) : "");
    setCompPadiWeight(r.padi_weight ? String(r.padi_weight) : "");
    setCompBags(r.processed_bags ? String(r.processed_bags) : "");
  };

  const load = useCallback(async (s = start, e = end, silent = false, forceRefresh = false) => {
    if (!silent) setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (s) qs.set("start", s);
      if (e) qs.set("end", e);
      if (selectedBranchId) qs.set("branch_id", selectedBranchId);
      if (search.trim()) qs.set("q", search.trim());
      if (forceRefresh) qs.set("no_cache", "true");
      const d = await api<Payload>(`/dashboard/arrivals?${qs.toString()}`);
      setData(d);
      cachedMemoryArrivals = d;
      await storage.setItem("cached_arrivals_dashboard", d);
    } catch (err: any) {
      console.warn("Failed to load arrivals dashboard:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedBranchId, search]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      cachedMemoryArrivals = null;
      await storage.removeItem("cached_arrivals_dashboard");
      await load(start, end, true, true);
    } finally {
      setRefreshing(false);
    }
  }, [load, start, end]);

  const handleCompleteSubmit = async () => {
    if (!completeBatch) return;
    const dry = parseFloat(compDryWeight);
    if (!dry || dry <= 0) {
      Alert.alert("Invalid Input", "Please enter a valid processed dry weight.");
      return;
    }
    const padi = parseFloat(compPadiWeight || "0");
    const bagsNum = parseInt(compBags || "0", 10);
    const targetBatchNo = completeBatch.batch_no;
    const targetCustomerName = completeBatch.customer_name;
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

      // Clear cached data so UI is forced fresh
      cachedMemoryArrivals = null;
      await storage.removeItem("cached_arrivals_dashboard");

      setCompleteBatch(null);

      // Trigger full refresh showing loader image & switch to completed tab
      setLoading(true);
      setProcSubTab("completed");
      await load(start, end, false, true);

      Alert.alert("Processing Completed", `Batch ${targetBatchNo} marked Completed & WhatsApp alert sent to ${targetCustomerName}!`);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to complete processing");
    } finally {
      setCompleting(false);
      setLoading(false);
    }
  };

  const applyPreset = (key: string) => {
    setActivePreset(key);
    let s = "";
    let e = "";
    if (key === "today") {
      s = todayISO();
      e = todayISO();
    } else if (key === "yesterday") {
      s = yesterdayISO();
      e = yesterdayISO();
    } else if (key === "week") {
      s = weekStartISO();
      e = todayISO();
    } else if (key === "month") {
      s = monthStartISO();
      e = todayISO();
    } else if (key === "all") {
      s = "";
      e = "";
    }
    setStart(s);
    setEnd(e);
    setLoading(true);
    load(s, e, false, true);
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

  useEffect(() => {
    if (params.q !== undefined) {
      setSearch(params.q);
    }
    if (params.tab && ["in", "processing", "out"].includes(params.tab)) {
      setTab(params.tab as any);
    }
    const resolved = resolveDatesFromParams();
    setStart(resolved.s);
    setEnd(resolved.e);
    setActivePreset(resolved.p);
    load(resolved.s, resolved.e, false, true);
  }, [params.q, params.tab, params.preset, params.start, params.end, resolveDatesFromParams]);

  useFocusEffect(useCallback(() => { load(start, end, !!data); }, [load, start, end, !!data]));

  useSyncRefresh(useCallback(async () => {
    await load(false, true);
  }, [load]));

    const shareArrivalWhatsApp = async (r: Row) => {
    const msg = buildArrivalMessage({
      companyName: "E3 AGRO",
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

  const rows: Row[] =
    tab === "in"
      ? data?.in || []
      : tab === "out"
      ? data?.out || []
      : procSubTab === "completed"
      ? data?.completed || []
      : data?.processing || [];

  const renderBatchCard = (r: Row, isInsideMachineGroup = false) => {
    const isCompletedRow = r.status === "Completed";
    const dateStr = (tab === "out" || isCompletedRow) ? (r.delivery_date || r.arrival_date) : r.arrival_date;
    const weightVal = (tab === "out" || isCompletedRow) ? (r.actual_dry_weight || 0) : r.raw_weight;
    const weightLabel = (tab === "out" || isCompletedRow) ? "dried" : "wet / raw";
    const accent = tab === "in" ? colors.primary : tab === "out" ? colors.purple : isCompletedRow ? "#2E7D32" : colors.warning;
    const isProcessingTab = tab === "processing";
    const hasSplitLots = tab === "in" && r.is_split && r.sub_batches && r.sub_batches.length > 1;

    return (
      <TouchableOpacity
        key={r.batch_id}
        testID={`arrival-${r.batch_id}`}
        style={[styles.rowCard, isInsideMachineGroup && styles.rowCardIndented]}
        onPress={() => router.push(`/batch/${r.batch_id}`)}
        activeOpacity={0.88}
      >
        {/* Top Header: Avatar + Customer ID | Customer Info | Weight Badge */}
        <View style={styles.cardTopRow}>
          <View style={styles.avatarCol}>
            <View style={[styles.avatar, { backgroundColor: accent + "15" }]}>
              <Text style={[styles.avatarText, { color: accent }]}>{r.customer_name.slice(0, 1).toUpperCase()}</Text>
            </View>
            {r.customer_code ? (
              <View style={styles.codeChipBelow}>
                <Text style={styles.codeChipBelowText}>{r.customer_code}</Text>
              </View>
            ) : null}
          </View>

          <View style={{ flex: 1, justifyContent: "center" }}>
            <Text style={styles.name} numberOfLines={1}>{r.customer_name}</Text>
            <View style={styles.metaRow}>
              <View style={styles.spiceTag}>
                <Text style={styles.spiceTagText}>{r.product || "Cardamom"}</Text>
              </View>
              <Text style={styles.batchTag}>#{r.batch_no}</Text>
              {r.customer_mobile ? (
                <View style={styles.phoneWrap}>
                  <MaterialCommunityIcons name="phone" size={10} color={colors.textLight} />
                  <Text style={styles.phoneText}>{r.customer_mobile}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.weightBox}>
            <View style={{ flexDirection: "row", alignItems: "baseline" }}>
              <Text style={[styles.weightNum, { color: accent }]}>{weightVal}</Text>
              <Text style={[styles.weightUnit, { color: accent }]}> kg</Text>
            </View>
            <Text style={styles.weightLabelText}>{weightLabel}</Text>
          </View>
        </View>

        {/* Sleek Lifecycle Timeline Strip */}
        <View style={styles.lifecycleStrip}>
          <View style={styles.timelineItem}>
            <MaterialCommunityIcons name="calendar-month-outline" size={13} color="#15803D" />
            <Text style={styles.timelineDateText}>{fmtDate(r.arrival_date)}</Text>
          </View>

          {tab === "processing" && !isCompletedRow && r.processing_started_at ? (
            <>
              <View style={styles.timelineDot} />
              <View style={styles.timelineItem}>
                <MaterialCommunityIcons name="fire" size={13} color="#D97706" />
                <Text style={styles.timelineStartedText}>Started {fmtDateTime(r.processing_started_at)}</Text>
              </View>
            </>
          ) : null}

          {isCompletedRow && (
            <>
              <View style={styles.timelineDot} />
              <View style={styles.timelineItem}>
                <MaterialCommunityIcons name="check-circle" size={13} color="#15803D" />
                <Text style={styles.timelineCompletedText}>Dried {fmtDateTime(r.processing_ended_at || r.delivery_date)}</Text>
              </View>
            </>
          )}

          {tab === "out" && r.delivery_date && (
            <>
              <View style={styles.timelineDot} />
              <View style={styles.timelineItem}>
                <MaterialCommunityIcons name="truck-delivery" size={13} color="#7E22CE" />
                <Text style={styles.timelineDeliveredText}>Delivered {fmtDateTime(r.delivery_date)}</Text>
              </View>
            </>
          )}
        </View>

        {/* Multi-lot split badges if loaded across different dryers */}
        {hasSplitLots && (
          <View style={styles.splitLotBox}>
            <View style={styles.splitLotHeader}>
              <MaterialCommunityIcons name="call-split" size={13} color={colors.primary} />
              <Text style={styles.splitLotTitle}>{r.sub_batches!.length} Split Lots Loaded Across Dryers (Tap to Edit):</Text>
            </View>
            <View style={styles.splitPillsRow}>
              {r.sub_batches!.map((sb, idx) => (
                <TouchableOpacity
                  key={sb.batch_id || idx}
                  style={styles.splitPill}
                  activeOpacity={0.7}
                  onPress={(e) => {
                    e.stopPropagation();
                    router.push(`/batch/${sb.batch_id}`);
                  }}
                >
                  <Text style={styles.splitPillWeight}>{sb.raw_weight} kg</Text>
                  <Text style={styles.splitPillMachine}>• {sb.machine_name || "Dryer"}</Text>
                  <View style={[
                    styles.splitPillStatusDot, 
                    { backgroundColor: sb.status === 'Drying' ? '#F57C00' : sb.status === 'Completed' ? '#2E7D32' : '#757575' }
                  ]} />
                  <MaterialCommunityIcons name="pencil-outline" size={11} color={colors.primary} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Option 1: 3-Column Operational Strip (Total Arrival / In This Dryer / Batch Type) */}
        <View style={styles.opsBar}>
          {/* Column 1: Total Arrival Weight */}
          <View style={styles.opsItem}>
            <Text style={styles.opsLabel}>TOTAL ARRIVAL</Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 2 }}>
              <Text style={styles.opsVal}>{r.total_arrival_weight || r.raw_weight}</Text>
              <Text style={styles.opsUnit}> KG</Text>
            </View>
            <Text style={styles.opsSub}>Customer Total</Text>
          </View>

          <View style={styles.opsDivider} />

          {/* Column 2: In This Dryer / Processing KG */}
          <View style={styles.opsItem}>
            <Text style={styles.opsLabel}>IN THIS DRYER</Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 2 }}>
              <Text style={[styles.opsVal, { color: accent }]}>{r.raw_weight}</Text>
              <Text style={[styles.opsUnit, { color: accent }]}> KG</Text>
            </View>
            <Text style={styles.opsSub}>{r.batch_no}</Text>
          </View>

          <View style={styles.opsDivider} />

          {/* Column 3: Split vs Single Batch info */}
          <View style={styles.opsItem}>
            <Text style={styles.opsLabel}>BATCH TYPE</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 }}>
              <MaterialCommunityIcons
                name={r.is_split ? "call-split" : "check-circle"}
                size={12}
                color={r.is_split ? "#D97706" : "#15803D"}
              />
              <Text
                style={[styles.opsValType, { color: r.is_split ? "#D97706" : "#15803D" }]}
                numberOfLines={1}
              >
                {r.is_split ? `Split Lot (${r.split_count || 2} Lots)` : "Single Batch"}
              </Text>
            </View>
            <Text style={styles.opsSub} numberOfLines={1}>
              {r.is_split ? (r.other_lots_summary || "Multi-Dryer") : "Full Load (100%)"}
            </Text>
          </View>
        </View>

        {/* Branch on Left, Machine on Right */}
        <View style={styles.cardBottomRow}>
          <View style={styles.bottomMetaItem}>
            <MaterialCommunityIcons name="office-building" size={12} color={colors.primary} />
            <Text style={styles.branchText}>{r.branch_name || "-"}</Text>
          </View>

          {r.machine_name && !isInsideMachineGroup ? (
            <View style={styles.machineBadgeRight}>
              <MaterialCommunityIcons name="generator-portable" size={12} color="#D97706" />
              <Text style={styles.machineTextRight} numberOfLines={1}>{r.machine_name}</Text>
            </View>
          ) : null}
        </View>

        {isCompletedRow ? (
          <View style={styles.cardCompletedBox}>
            <View style={styles.completedBadge}>
              <MaterialCommunityIcons name="check-decagram" size={18} color="#2E7D32" />
              <View style={{ flex: 1 }}>
                <Text style={styles.completedBadgeTitle}>Processing Completed ✓</Text>
                <Text style={styles.completedBadgeSub}>
                  Dry: {r.actual_dry_weight} kg • Wet: {r.raw_weight} kg
                  {r.raw_weight && r.actual_dry_weight ? ` (Yield: ${((Number(r.actual_dry_weight) / Number(r.raw_weight)) * 100).toFixed(1)}%)` : ""}
                </Text>
              </View>
            </View>
            <View style={styles.completedActionRow}>
              <TouchableOpacity
                style={styles.cardDeliverBtn}
                onPress={(e) => {
                  e.stopPropagation();
                  router.push(`/delivery/${r.batch_id}`);
                }}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="truck-delivery-outline" size={13} color="#fff" />
                <Text style={styles.cardDeliverBtnText}>Deliver Stock</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cardEditCompleteBtn}
                onPress={(e) => {
                  e.stopPropagation();
                  openCompleteModal(r);
                }}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="pencil-outline" size={13} color={colors.primary} />
                <Text style={styles.cardEditCompleteBtnText}>Edit</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : isProcessingTab ? (
          <TouchableOpacity
            style={styles.cardCompleteBtn}
            onPress={(e) => {
              e.stopPropagation();
              openCompleteModal(r);
            }}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="check-circle" size={15} color="#fff" />
            <Text style={styles.cardCompleteBtnText}>Complete Processing</Text>
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.safe}>
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
                  const s = draftStart;
                  const e = draftEnd || draftStart;
                  setStart(s);
                  setEnd(e);
                  setActivePreset("custom");
                  setLoading(true);
                  load(s, e, false, true);
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
          const machineCount = data?.totals.processing_machine_count;
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
                {t.key === "processing" && machineCount ? (
                  `${machineCount} Dryer${machineCount > 1 ? "s" : ""} (${count || 0} Lots)`
                ) : (
                  `${count || 0} ${t.key === "in" ? "Arrivals" : "Batches"}`
                )} - {(weight || 0).toLocaleString("en-IN")} kg
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {!data && loading ? (
        <View style={styles.loaderWrap}>
          <Loader size={48} />
          <Text style={styles.loaderTitle}>Processing & Syncing Dryers...</Text>
          <Text style={styles.loaderSubtitle}>Fetching live machine loads and completed lots</Text>
        </View>
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary, colors.warning]}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100, gap: spacing.sm }}
        >
          {tab === "processing" && (
            <View style={styles.subTabRow}>
              <TouchableOpacity
                style={[styles.subTabBtn, procSubTab === "active" && styles.subTabBtnActive]}
                onPress={() => setProcSubTab("active")}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="generator-portable"
                  size={16}
                  color={procSubTab === "active" ? "#fff" : colors.warning}
                />
                <Text style={[styles.subTabBtnText, procSubTab === "active" && styles.subTabBtnTextActive]}>
                  In Dryers ({data?.totals?.processing_count || 0})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.subTabBtn, procSubTab === "completed" && styles.subTabBtnActiveGreen]}
                onPress={() => setProcSubTab("completed")}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="check-decagram"
                  size={16}
                  color={procSubTab === "completed" ? "#fff" : "#2E7D32"}
                />
                <Text style={[styles.subTabBtnText, procSubTab === "completed" && styles.subTabBtnTextActive]}>
                  Ready for Delivery ({data?.totals?.completed_count || 0})
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {rows.length === 0 && (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="inbox-outline" size={48} color={colors.textLight} />
              <Text style={styles.emptyText}>
                No {tab === "in" ? "arrivals" : tab === "out" ? "deliveries" : procSubTab === "completed" ? "completed batches awaiting delivery" : "batches currently in dryers"}
              </Text>
            </View>
          )}

          {tab === "processing" && procSubTab === "active" && (data?.processing_machines && data.processing_machines.length > 0) ? (
            data.processing_machines.map(pm => (
              <View key={pm.machine_id} style={styles.machineGroupSection}>
                <View style={styles.machineGroupHeader}>
                  <View style={styles.machineGroupLeft}>
                    <View style={styles.machineIconWrap}>
                      <MaterialCommunityIcons name="generator-portable" size={18} color="#E65100" />
                    </View>
                    <View>
                      <Text style={styles.machineGroupName}>{pm.machine_name}</Text>
                      <Text style={styles.machineGroupSubtitle}>
                        {pm.batches.length > 1 ? `Multi-Lot Combined Batch (${pm.batches.length} Lots)` : "Single Customer Lot"}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.machineGroupRight}>
                    <Text style={styles.machineGroupTotalWeight}>{pm.total_weight} KG</Text>
                    <Text style={styles.machineGroupTotalLabel}>Total Dryer Load</Text>
                  </View>
                </View>
                <View style={{ gap: spacing.xs, marginTop: 4 }}>
                  {pm.batches.map(b => renderBatchCard(b, true))}
                </View>
              </View>
            ))
          ) : (
            rows.map(r => renderBatchCard(r, false))
          )}
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
                  <Text style={styles.inputTitle}>Padi Weight (1L Wt)</Text>
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
              {parseFloat(compDryWeight || "0") > 0 && (() => {
                const wet = completeBatch?.raw_weight || 0;
                const dry = parseFloat(compDryWeight || "0");
                const loss = Math.max(0, wet - dry);
                const lossPct = wet > 0 ? ((loss / wet) * 100).toFixed(1) : "0.0";
                const yieldPct = wet > 0 ? ((dry / wet) * 100).toFixed(1) : "0.0";
                const padiVal = parseFloat(compPadiWeight || "0");
                return (
                  <View style={styles.calcSummaryBox}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                      <Text style={styles.calcLabel}>Processed Dry Output:</Text>
                      <Text style={styles.calcVal}>{dry.toFixed(2)} KG</Text>
                    </View>
                    {padiVal > 0 && (
                      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                        <Text style={styles.calcLabel}>Padi Weight (1L Density):</Text>
                        <Text style={[styles.calcVal, { color: colors.textMuted }]}>{padiVal.toFixed(2)} (Ref)</Text>
                      </View>
                    )}
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                      <Text style={styles.calcLabel}>Weight Loss (Moisture):</Text>
                      <Text style={[styles.calcVal, { color: colors.warning }]}>
                        {loss.toFixed(2)} KG ({lossPct}%)
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={styles.calcLabel}>Dry Yield:</Text>
                      <Text style={[styles.calcVal, { color: "#2E7D32" }]}>{yieldPct}%</Text>
                    </View>
                  </View>
                );
              })()}
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

      {/* Floating Overlay Loader when data is refreshing */}
      {loading && !!data && (
        <Modal transparent animationType="fade" visible={loading && !!data} onRequestClose={() => {}}>
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingModalCard}>
              <Loader size={38} />
              <Text style={styles.loadingModalTitle}>Processing & Syncing Dryers...</Text>
              <Text style={styles.loadingModalSubtitle}>Fetching live machine loads and completed lots</Text>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.16)",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingModalCard: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 18,
    elevation: 10,
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.9)",
    minWidth: 180,
    maxWidth: 240,
  },
  loadingModalTitle: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 8,
    textAlign: "center",
  },
  loadingModalSubtitle: {
    fontSize: 10.5,
    fontWeight: "500",
    color: "#64748B",
    marginTop: 2,
    textAlign: "center",
  },
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

  rowCard: {
    backgroundColor: "#ffffff",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    gap: 10,
  },
  rowCardIndented: {
    borderLeftWidth: 4,
    borderLeftColor: "#F97316",
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  avatarCol: {
    alignItems: "center",
    justifyContent: "flex-start",
    minWidth: 42,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "800",
  },
  codeChipBelow: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    backgroundColor: "#FEF3C7",
    borderRadius: 4,
    marginTop: 3,
    alignItems: "center",
    borderWidth: 0.5,
    borderColor: "#FDE68A",
  },
  codeChipBelowText: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#B45309",
    letterSpacing: 0.3,
  },
  name: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 3,
  },
  spiceTag: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    backgroundColor: "#F1F5F9",
    borderRadius: 4,
  },
  spiceTagText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#475569",
  },
  batchTag: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    letterSpacing: 0.2,
  },
  phoneWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  phoneText: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "500",
  },
  weightBox: {
    alignItems: "flex-end",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  weightNum: {
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  weightUnit: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  weightLabelText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#94A3B8",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 1,
  },
  lifecycleStrip: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 6,
  },
  timelineItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  timelineDateText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#15803D",
  },
  timelineDot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    marginHorizontal: 2,
  },
  timelineStartedText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#B45309",
  },
  timelineCompletedText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#15803D",
  },
  timelineDeliveredText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#7E22CE",
  },
  opsBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  opsItem: {
    flex: 1,
    alignItems: "center",
  },
  opsLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.5,
  },
  opsVal: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0F172A",
  },
  opsUnit: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
  },
  opsValType: {
    fontSize: 11,
    fontWeight: "800",
  },
  opsSub: {
    fontSize: 9.5,
    fontWeight: "600",
    color: "#94A3B8",
    marginTop: 1,
  },
  opsDivider: {
    width: 1,
    height: 26,
    backgroundColor: "#E2E8F0",
  },
  cardBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
  },
  bottomMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  branchText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: "700",
  },
  machineBadgeRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFFBEB",
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  machineTextRight: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#B45309",
  },
  cardCompleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#EA580C",
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 4,
    shadowColor: "#EA580C",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  cardCompleteBtnText: {
    color: "#fff",
    fontSize: 12.5,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  empty: { alignItems: "center", paddingVertical: 60, gap: 6 },
  emptyText: { fontSize: 14, color: colors.textMuted, fontWeight: "600", marginTop: 12, textAlign: "center" },
  waArrivalBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#25D366", alignItems: "center", justifyContent: "center" },
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
  splitLotBox: {
    marginTop: 8,
    backgroundColor: "#F0FDF4",
    padding: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#DCFCE7",
  },
  splitLotHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 6,
  },
  splitLotTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
  },
  splitPillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  splitPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    gap: 4,
  },
  splitPillWeight: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.text,
  },
  splitPillMachine: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "600",
  },
  splitPillStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  machineGroupSection: {
    marginBottom: spacing.sm,
  },
  machineGroupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFF8E1",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#FFE082",
    marginBottom: 6,
  },
  machineGroupLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  machineIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFF3E0",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FFCC80",
  },
  machineGroupName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#E65100",
  },
  machineGroupSubtitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "#B78103",
    marginTop: 1,
  },
  machineGroupRight: {
    alignItems: "flex-end",
  },
  machineGroupTotalWeight: {
    fontSize: 16,
    fontWeight: "900",
    color: "#E65100",
  },
  machineGroupTotalLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#B78103",
    textTransform: "uppercase",
  },
  subTabRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  subTabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadow.sm,
  },
  subTabBtnActive: {
    backgroundColor: "#E65100",
    borderColor: "#E65100",
  },
  subTabBtnActiveGreen: {
    backgroundColor: "#2E7D32",
    borderColor: "#2E7D32",
  },
  subTabBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  subTabBtnTextActive: {
    color: "#fff",
  },
  subTabBadge: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textMuted,
  },
  subTabBadgeActive: {
    color: "#FFE082",
  },
  subTabBadgeActiveGreen: {
    color: "#C8E6C9",
  },
  cardCompletedBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#E8F5E9",
    borderWidth: 1,
    borderColor: "#A5D6A7",
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
    gap: 10,
  },
  completedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  completedBadgeTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#2E7D32",
  },
  completedBadgeSub: {
    fontSize: 11,
    fontWeight: "600",
    color: "#388E3C",
    marginTop: 1,
  },
  completedActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardDeliverBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#2E7D32",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  cardDeliverBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#fff",
  },
  cardEditCompleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.primary + "60",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  cardEditCompleteBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
  },
  loaderWrap: {
    paddingTop: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  loaderTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
    marginTop: 12,
  },
  loaderSubtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.textMuted,
    marginTop: 4,
  },
});
