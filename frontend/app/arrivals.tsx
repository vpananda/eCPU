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
  const params = useLocalSearchParams<{ start?: string; end?: string; tab?: string; q?: string }>();
  const [data, setData] = useState<Payload | null>(cachedMemoryArrivals);
  const [loading, setLoading] = useState(!cachedMemoryArrivals);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState(params.q || "");
  const [tab, setTab] = useState<"in" | "processing" | "out">((params.tab as any) || "in");
  const [procSubTab, setProcSubTab] = useState<"active" | "completed">("active");

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
    setCompDryWeight(r.actual_dry_weight ? String(r.actual_dry_weight) : "");
    setCompPadiWeight(r.padi_weight ? String(r.padi_weight) : "");
    setCompBags(r.processed_bags ? String(r.processed_bags) : "");
  };

  const load = useCallback(async (silent = false, forceRefresh = false) => {
    if (!silent && (!cachedMemoryArrivals || forceRefresh)) setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (start) qs.set("start", start);
      if (end) qs.set("end", end);
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
  }, [start, end, selectedBranchId, search]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      cachedMemoryArrivals = null;
      await storage.removeItem("cached_arrivals_dashboard");
      await load(true, true);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

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
      await load(false, true);

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

  useFocusEffect(useCallback(() => { load(!!data); }, [load, !!data]));

  useSyncRefresh(useCallback(async () => {
    await load(false, true);
  }, [load]));

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
            
            {/* Highlighted Arrival Date & Lifecycle Timeline */}
            <View style={styles.dateBadgesContainer}>
              <View style={styles.arrivalDatePill}>
                <MaterialCommunityIcons name="calendar-import" size={12} color="#166534" />
                <Text style={styles.arrivalDateLabel}>Arrived:</Text>
                <Text style={styles.arrivalDateValue}>{fmtDate(r.arrival_date)}</Text>
              </View>

              {tab === "processing" && !isCompletedRow && r.processing_started_at ? (
                <View style={styles.processTimePill}>
                  <MaterialCommunityIcons name="fire" size={11} color="#D97706" />
                  <Text style={styles.processTimeLabel}>Started:</Text>
                  <Text style={styles.processTimeValue}>{fmtDateTime(r.processing_started_at)}</Text>
                </View>
              ) : null}

              {isCompletedRow && (
                <View style={styles.processCompletedPill}>
                  <MaterialCommunityIcons name="check-circle" size={11} color="#2E7D32" />
                  <Text style={styles.processCompletedLabel}>Dried:</Text>
                  <Text style={styles.processCompletedValue}>{fmtDateTime(r.processing_ended_at || r.delivery_date)}</Text>
                </View>
              )}

              {tab === "out" && r.delivery_date && (
                <View style={styles.deliveryPill}>
                  <MaterialCommunityIcons name="truck-delivery" size={11} color="#7B1FA2" />
                  <Text style={styles.deliveryPillLabel}>Delivered:</Text>
                  <Text style={styles.deliveryPillValue}>{fmtDateTime(r.delivery_date)}</Text>
                </View>
              )}
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.meta}>{r.product}</Text>
              <Text style={styles.metaDot}>·</Text>
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

          {r.machine_name && !isInsideMachineGroup ? (
            <View style={styles.machineBadgeRight}>
              <MaterialCommunityIcons name="generator-portable" size={12} color={colors.warning} />
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
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="check-circle" size={14} color="#fff" />
            <Text style={styles.cardCompleteBtnText}>Complete Processing</Text>
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
    );
  };

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

      {loading ? (
        <View style={styles.loaderWrap}>
          <Loader size={76} />
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
  dateBadgesContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    marginBottom: 2,
  },
  arrivalDatePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  arrivalDateLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#065F46",
  },
  arrivalDateValue: {
    fontSize: 11,
    fontWeight: "800",
    color: "#166534",
  },
  processTimePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFFBEB",
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  processTimeLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#92400E",
  },
  processTimeValue: {
    fontSize: 11,
    fontWeight: "800",
    color: "#B45309",
  },
  processCompletedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F0FDF4",
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  processCompletedLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#166534",
  },
  processCompletedValue: {
    fontSize: 11,
    fontWeight: "800",
    color: "#2E7D32",
  },
  deliveryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FAF5FF",
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#E9D5FF",
  },
  deliveryPillLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#6B21A8",
  },
  deliveryPillValue: {
    fontSize: 11,
    fontWeight: "800",
    color: "#7B1FA2",
  },
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
  rowCardIndented: {
    borderLeftWidth: 3,
    borderLeftColor: "#F57C00",
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
