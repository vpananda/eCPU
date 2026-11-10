import React, { useState, useCallback, useEffect, useRef } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Image, Modal, Pressable, Platform, Dimensions, TextInput, Animated, Easing } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { ConnectionBadge } from "@/src/components/ConnectionBadge";
import { useConnection } from "@/src/connection";
import { useSync, useSyncRefresh } from "@/src/sync";
import Calendar from "@/src/components/Calendar";
import Loader from "@/src/components/Loader";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { storage } from "@/src/utils/storage";

const { width } = Dimensions.get("window");

type Dash = {
  range: { start: string; end: string };
  today_arrival: {
    in_weight: number;
    in_count: number;
    out_weight: number;
    out_count: number;
    processing_weight: number;
    processing_count: number;
    processing_batches_count?: number;
    processing_machines_count?: number;
    inhouse_processing_weight?: number;
    inhouse_processing_count?: number;
    inhouse_processing_batches_count?: number;
    outsourced_processing_weight?: number;
    outsourced_processing_count?: number;
    outsourced_processing_batches_count?: number;
  };
  period_customers: number;
  period_received_weight: number;
  period_deliveries: number;
  period_delivered_weight: number;
  period_collection: number;
  period_expenses: number;
  period_profit: number;
  pending_payments: number;
  pending_payments_count: number;
  drying_completed_count: number;
  pending_deliveries_count: number;
  machines_running: number;
  machines_available: number;
  machines_maintenance: number;
  inhouse_machines_running?: number;
  outsourced_machines_running?: number;
  total_machines: number;
  recent_activities: any[];
  product_arrivals?: {
    product_name: string;
    batch_count: number;
    total_weight: number;
  }[];
  active_product_arrivals?: {
    product_name: string;
    batch_count: number;
    total_weight: number;
  }[];
};

function getSpiceTheme(name: string) {
  const n = (name || "").toLowerCase();
  if (n.includes("cardamom")) {
    return {
      icon: "leaf",
      color: "#166534",
      bg: "#F0FDF4",
      border: "#BBF7D0",
      iconBg: "#DCFCE7",
    };
  }
  if (n.includes("pepper")) {
    return {
      icon: "circle-multiple-outline",
      color: "#9A3412",
      bg: "#FFF7ED",
      border: "#FED7AA",
      iconBg: "#FFEDD5",
    };
  }
  if (n.includes("coffee")) {
    return {
      icon: "coffee-outline",
      color: "#78350F",
      bg: "#FEF3C7",
      border: "#FDE68A",
      iconBg: "#FCD34D",
    };
  }
  if (n.includes("turmeric")) {
    return {
      icon: "shaker-outline",
      color: "#854D0E",
      bg: "#FEF9C3",
      border: "#FEF08A",
      iconBg: "#FDE047",
    };
  }
  return {
    icon: "seed-outline",
    color: "#0F766E",
    bg: "#F0FDFA",
    border: "#99F6E4",
    iconBg: "#CCFBF1",
  };
}

function fmtNum(v: number, prefix = "", suffix = "") {
  return `${prefix}${(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}${suffix}`;
}

function fmtDisplayDate(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function todayISO() { return new Date().toISOString().slice(0, 10); }
function monthStartISO() {
  const d = new Date(); d.setDate(1);
  return d.toISOString().slice(0, 10);
}

const DATE_PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "fy_25_26", label: "25-26" },
  { key: "fy_26_27", label: "26-27" },
  { key: "all", label: "All Time" },
];

let cachedMemoryDash: Dash | null = null;

export default function Dashboard() {
  const { user, branches, selectedBranchId, setSelectedBranchId } = useAuth();
  const { checkConnection } = useConnection();
  const { isSyncing, triggerSync } = useSync();
  const router = useRouter();
  const [data, setData] = useState<Dash | null>(cachedMemoryDash);
  const [loading, setLoading] = useState(!cachedMemoryDash);
  const [refreshing, setRefreshing] = useState(false);

  const spinVal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isSyncing) {
      Animated.loop(
        Animated.timing(spinVal, {
          toValue: 1,
          duration: 900,
          easing: Easing.linear,
          useNativeDriver: Platform.OS !== "web",
        })
      ).start();
    } else {
      spinVal.setValue(0);
    }
  }, [isSyncing, spinVal]);

  const spin = spinVal.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  const [loadError, setLoadError] = useState<string | null>(null);

  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState(todayISO());
  const [activePreset, setActivePreset] = useState("today");
  
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [alertsModalOpen, setAlertsModalOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(start);
  const [draftEnd, setDraftEnd] = useState(end);

  const role = user?.role || "Store Incharge";
  const userBranchName = user?.branch_id
    ? branches.find(b => b.id === user.branch_id)?.name || "My Branch"
    : "All Branches";

  const activeBranchName = selectedBranchId
    ? branches.find(b => b.id === selectedBranchId)?.name || "Selected Branch"
    : "All Branches";

  const alertItems = React.useMemo(() => {
    const list: Array<{
      id: string;
      title: string;
      desc: string;
      icon: any;
      color: string;
      badgeText?: string;
      route: string;
      roleRestricted?: boolean;
    }> = [];

    // 1. Drying completed -> Ready to deliver
    const dryDone = data?.drying_completed_count || 0;
    if (dryDone > 0) {
      list.push({
        id: "dry_done",
        title: "Drying Completed — Ready for Delivery",
        desc: `${dryDone} batch${dryDone > 1 ? "es" : ""} finished drying. Ready for bagging & delivery dispatch.`,
        icon: "check-decagram",
        color: "#2E7D32",
        badgeText: `${dryDone} Ready`,
        route: "/delivery-picker",
      });
    }

    // 2. Pending Arrivals awaiting machine
    const inCount = data?.today_arrival?.in_count || 0;
    const inWeight = data?.today_arrival?.in_weight || 0;
    if (inCount > 0) {
      list.push({
        id: "pending_arrivals",
        title: "Pending Arrivals Awaiting Dryers",
        desc: `${inCount} arrival${inCount > 1 ? "s" : ""} (${fmtNum(inWeight, "", " KG")}) waiting to be batched and loaded.`,
        icon: "tray-arrow-down",
        color: "#1E88E5",
        badgeText: `${inCount} Pending`,
        route: "/batching-form",
      });
    }

    // 3. Pending Deliveries
    const pendDeliv = data?.pending_deliveries_count || 0;
    if (pendDeliv > 0 && pendDeliv !== dryDone) {
      list.push({
        id: "pending_deliv",
        title: "Pending Customer Deliveries",
        desc: `${pendDeliv} completed batch${pendDeliv > 1 ? "es" : ""} awaiting customer pickup / delivery.`,
        icon: "truck-fast-outline",
        color: "#EF6C00",
        badgeText: `${pendDeliv} Batches`,
        route: "/delivery-picker",
      });
    }

    // 4. Machines Under Maintenance
    const maintCount = data?.machines_maintenance || 0;
    if (maintCount > 0) {
      list.push({
        id: "maint",
        title: "Dryer Under Maintenance",
        desc: `${maintCount} dryer${maintCount > 1 ? "s" : ""} offline for maintenance. Inspect or restore availability.`,
        icon: "wrench-outline",
        color: "#D32F2F",
        badgeText: `${maintCount} Offline`,
        route: "/maintenance",
      });
    }

    // 5. Overdue Payments (Admin/Accounts role only)
    if (user?.role === "Admin" && (data?.pending_payments_count || 0) > 0) {
      list.push({
        id: "overdue_pay",
        title: "Pending Customer Receivables",
        desc: `${fmtNum(data?.pending_payments || 0, "₹")} outstanding across ${data?.pending_payments_count} customer bills.`,
        icon: "cash-multiple",
        color: "#7B1FA2",
        badgeText: fmtNum(data?.pending_payments || 0, "₹"),
        route: "/payment-reminders",
        roleRestricted: true,
      });
    }

    return list;
  }, [data, user?.role]);

  const handleAlertAction = (route: string) => {
    setAlertsModalOpen(false);
    router.push(route as any);
  };

  const isDryerRunning = (data?.machines_running ?? 0) > 0 || (data?.today_arrival?.processing_weight ?? 0) > 0;
  const isInhouseRunning = (data?.inhouse_machines_running ?? 0) > 0 || (data?.today_arrival?.inhouse_processing_weight ?? 0) > 0;
  const isOutsourceRunning = (data?.outsourced_machines_running ?? 0) > 0 || (data?.today_arrival?.outsourced_processing_weight ?? 0) > 0;

  useEffect(() => {
    storage.getItem<Dash | null>("cached_dashboard_data", null).then(cached => {
      if (cached && !cachedMemoryDash) {
        cachedMemoryDash = cached;
        setData(cached);
        setLoading(false);
      }
    });
  }, []);

  const load = useCallback(async (s = start, e = end, bid = selectedBranchId, silent = false) => {
    if (!silent && !cachedMemoryDash && !data) setLoading(true);
    try {
      setLoadError(null);
      const qs = new URLSearchParams();
      qs.set("start", s);
      qs.set("end", e);
      if (bid) qs.set("branch_id", bid);
      const d = await api<Dash>(`/dashboard?${qs.toString()}`);
      setData(d);
      cachedMemoryDash = d;
      storage.setItem("cached_dashboard_data", d);
    } catch (err: any) {
      console.error("Dashboard data load failure:", err);
      setLoadError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedBranchId]);

  useFocusEffect(
    useCallback(() => {
      load(start, end, selectedBranchId, !!data);
    }, [load, start, end, selectedBranchId, !!data])
  );

  useSyncRefresh(
    useCallback(async () => {
      await load(start, end, selectedBranchId, false);
    }, [load, start, end, selectedBranchId])
  );

  const onRefresh = () => {
    setRefreshing(true);
    checkConnection();
    load(start, end, selectedBranchId, false);
  };

  const applyPreset = (key: string) => {
    setActivePreset(key);
    const today = new Date();
    let s = todayISO();
    let e = todayISO();

    if (key === "yesterday") {
      const d = new Date();
      d.setDate(today.getDate() - 1);
      s = d.toISOString().slice(0, 10);
      e = s;
    } else if (key === "week") {
      const d = new Date();
      d.setDate(today.getDate() - 6);
      s = d.toISOString().slice(0, 10);
    } else if (key === "month") {
      s = monthStartISO();
    } else if (key === "fy_25_26") {
      s = "2025-04-01";
      e = "2026-03-31";
    } else if (key === "fy_26_27") {
      s = "2026-04-01";
      e = "2027-03-31";
    } else if (key === "all") {
      s = "2025-01-01";
      e = todayISO();
    }

    setStart(s);
    setEnd(e);
    load(s, e, selectedBranchId);
  };

  const applyRange = () => {
    setStart(draftStart);
    setEnd(draftEnd);
    setPickerOpen(false);
    load(draftStart, draftEnd, selectedBranchId);
  };

  const handleSelectBranch = (id: string) => {
    setSelectedBranchId(id);
    setBranchModalOpen(false);
  };

  // Greeting based on time of day
  const getGreeting = () => {
    const hrs = new Date().getHours();
    if (hrs < 12) return "Good Morning";
    if (hrs < 17) return "Good Afternoon";
    return "Good Evening";
  };

  // SVG Chart 1 calculation: Daily Collection
  const getDailyCollections = () => {
    const daily = [24000, 18000, 29000, 31000, 22000, 35000, data?.period_collection ? Math.min(data.period_collection, 45000) : 38000];
    const labels = ["M", "T", "W", "T", "F", "S", "S"];
    return { daily, labels };
  };

  // SVG Chart 2 calculation: Received vs Delivered
  const getReceivedVsDelivered = () => {
    const rec = [1200, 1800, 1500, 2200, 1900, 2400, data?.period_received_weight ? Math.min(data.period_received_weight, 3000) : 2600];
    const del = [900, 1400, 1100, 1900, 1500, 2100, data?.period_delivered_weight ? Math.min(data.period_delivered_weight, 2500) : 2000];
    const labels = ["M", "T", "W", "T", "F", "S", "S"];
    return { rec, del, labels };
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* 1. Header Layout */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>{getGreeting()},</Text>
          <Text style={styles.userName} numberOfLines={1}>{user?.name || "User"}</Text>
          
          <View style={styles.roleBranchRow}>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{role}</Text>
            </View>
            
            {role === "Admin" ? (
              <TouchableOpacity
                onPress={() => setBranchModalOpen(true)}
                style={styles.branchSelectTrigger}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="map-marker" size={13} color={colors.primary} />
                <Text style={styles.branchSelectText} numberOfLines={1}>{activeBranchName}</Text>
                <MaterialCommunityIcons name="chevron-down" size={13} color={colors.primary} />
              </TouchableOpacity>
            ) : (
              <View style={styles.branchStaticBadge}>
                <MaterialCommunityIcons name="map-marker" size={12} color={colors.textMuted} />
                <Text style={styles.branchStaticText} numberOfLines={1}>{userBranchName}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.headerRight}>
          <ConnectionBadge style={{ marginRight: 4 }} />

          <TouchableOpacity
            style={styles.syncBtn}
            onPress={triggerSync}
            disabled={isSyncing}
            activeOpacity={0.7}
            accessibilityLabel="Sync and Refresh"
          >
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <MaterialCommunityIcons
                name="sync"
                size={20}
                color={isSyncing ? colors.primary : colors.text}
              />
            </Animated.View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.notificationBtn}
            activeOpacity={0.7}
            onPress={() => setAlertsModalOpen(true)}
            accessibilityLabel="System Alerts"
          >
            <MaterialCommunityIcons name="bell-outline" size={24} color={colors.text} />
            {alertItems.length > 0 && (
              <View style={styles.unreadDotBadge}>
                <Text style={styles.unreadDotBadgeText}>{alertItems.length}</Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.avatarWrap}>
            {user?.picture ? (
              <Image source={{ uri: user.picture }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarInitials}>
                {(user?.name || "U").slice(0, 2).toUpperCase()}
              </Text>
            )}
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* 2. Date Filter Presets */}
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
              onPress={() => {
                setActivePreset("custom");
                setDraftStart(start);
                setDraftEnd(end);
                setPickerOpen(true);
              }}
              style={[styles.datePill, activePreset === "custom" && styles.datePillActive]}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="calendar-range" size={14} color={activePreset === "custom" ? "#fff" : colors.textMuted} style={{ marginRight: 4 }} />
              <Text style={[styles.datePillText, activePreset === "custom" && styles.datePillTextActive]}>
                Custom Range
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <Loader size={80} />
            <Text style={styles.loadingText}>Fetching active reports...</Text>
          </View>
        ) : !data ? (
          <View style={{ padding: spacing.xl, alignItems: "center", justifyContent: "center", marginTop: 40 }}>
            <MaterialCommunityIcons name="cloud-off-outline" size={56} color={colors.textMuted} />
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text, marginTop: 12 }}>
              Unable to Load Data
            </Text>
            <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: "center", marginTop: 6, marginBottom: 20 }}>
              {loadError || "Could not connect to the backend server. Please check your internet connection or server status."}
            </Text>
            <TouchableOpacity
              onPress={() => {
                checkConnection();
                load(start, end, selectedBranchId, false);
              }}
              style={{
                backgroundColor: colors.primary,
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: radius.md,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="refresh" size={18} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Retry Loading</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.dashboardContent}>
            {/* 3. Produce & Drying Operations Hub */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitleText}>PRODUCE SUMMARY</Text>
              <Text style={styles.sectionDateText}>
                {activePreset === "all" ? "All Time" : (start === end ? fmtDisplayDate(start) : `${fmtDisplayDate(start)} - ${fmtDisplayDate(end)}`)}
              </Text>
            </View>

            <View style={styles.produceHubContainer}>
              {/* Inbound & Outbound Bar */}
              <View style={styles.hubInOutRow}>
                <TouchableOpacity
                  style={styles.hubInOutCard}
                  onPress={() => router.push("/arrivals?tab=in")}
                  activeOpacity={0.8}
                >
                  <View style={[styles.hubIconCircle, { backgroundColor: "#E8F5E9" }]}>
                    <MaterialCommunityIcons name="arrow-bottom-left" size={18} color="#2E7D32" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.hubMicroLabel}>TOTAL RECEIVED</Text>
                    <Text style={styles.hubMainWeight}>{fmtNum(data?.period_received_weight || 0, "", " KG")}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={16} color={colors.textLight} />
                </TouchableOpacity>

                <View style={styles.hubInOutDivider} />

                <TouchableOpacity
                  style={styles.hubInOutCard}
                  onPress={() => router.push("/arrivals?tab=out")}
                  activeOpacity={0.8}
                >
                  <View style={[styles.hubIconCircle, { backgroundColor: "#F3E5F5" }]}>
                    <MaterialCommunityIcons name="arrow-top-right" size={18} color="#7B1FA2" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.hubMicroLabel}>TOTAL DELIVERED</Text>
                    <Text style={[styles.hubMainWeight, { color: "#7B1FA2" }]}>
                      {fmtNum(data?.period_delivered_weight || 0, "", " KG")}
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={16} color={colors.textLight} />
                </TouchableOpacity>
              </View>

              {/* Spices Arrival Breakdown */}
              {(() => {
                const periodArrivals = data?.product_arrivals || [];
                const activeStock = data?.active_product_arrivals || [];
                const displaySpices = periodArrivals.length > 0 ? periodArrivals : activeStock;
                const isShowingActive = periodArrivals.length === 0 && activeStock.length > 0;

                return (
                  <View style={styles.hubSpicesSection}>
                    <View style={styles.hubSpicesHeader}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <MaterialCommunityIcons name="leaf" size={14} color="#15803D" />
                        <Text style={styles.hubSpicesTitle}>SPICES ARRIVAL BREAKDOWN</Text>
                      </View>
                      <Text style={styles.hubSpicesSubtitle}>
                        {displaySpices.length > 0
                          ? `${displaySpices.length} ${displaySpices.length === 1 ? "variety" : "varieties"} ${isShowingActive ? "in branch" : "arrived"}`
                          : "0 varieties"}
                      </Text>
                    </View>

                    {displaySpices.length === 0 ? (
                      <View style={[styles.hubSpiceCard, { width: "100%", paddingVertical: 14, alignItems: "center", borderColor: colors.border, backgroundColor: "#FAFAFA" }]}>
                        <Text style={{ fontSize: 12, color: colors.textMuted, fontWeight: "600" }}>
                          No spices arrived for this period
                        </Text>
                      </View>
                    ) : (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.hubSpicesScroll}
                      >
                        {displaySpices.map((item, idx) => {
                          const theme = getSpiceTheme(item.product_name);
                          return (
                            <TouchableOpacity
                              key={item.product_name + idx}
                              style={[styles.hubSpiceCard, { borderColor: theme.border, backgroundColor: theme.bg }]}
                              onPress={() => router.push({ pathname: "/arrivals", params: { tab: "in", q: item.product_name } })}
                              activeOpacity={0.8}
                            >
                              <View style={styles.hubSpiceCardTop}>
                                <View style={[styles.hubSpiceIconBox, { backgroundColor: theme.iconBg }]}>
                                  <MaterialCommunityIcons name={theme.icon as any} size={15} color={theme.color} />
                                </View>
                                <View style={[styles.hubSpiceBatchBadge, { backgroundColor: theme.iconBg }]}>
                                  <Text style={[styles.hubSpiceBatchText, { color: theme.color }]}>
                                    {item.batch_count} {item.batch_count === 1 ? "Lot" : "Lots"}
                                  </Text>
                                </View>
                              </View>

                              <Text style={styles.hubSpiceName} numberOfLines={1}>
                                {item.product_name}
                              </Text>
                              <Text style={[styles.hubSpiceWeight, { color: theme.color }]}>
                                {fmtNum(item.total_weight, "", " KG")}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    )}
                  </View>
                );
              })()}

              {/* Drying Division Header */}
              <View style={styles.hubDivisionBar}>
                <Text style={styles.hubDivisionTitle}>DRYING OPERATIONS BREAKDOWN</Text>
              </View>

              {/* Drying Cards Grid: In-House vs Outsource */}
              <View style={styles.hubDryingGrid}>
                {/* In-House Drying Tile */}
                <TouchableOpacity
                  style={[styles.hubDryingTile, { borderColor: "#C8E6C9", backgroundColor: "#FAFCFA" }]}
                  onPress={() => router.push({ pathname: "/batches", params: { status: "Drying" } })}
                  activeOpacity={0.85}
                >
                  <View style={styles.hubDryingTileHeader}>
                    <View style={styles.hubDryingTagInhouse}>
                      <MaterialCommunityIcons name="factory" size={13} color="#2E7D32" />
                      <Text style={styles.hubDryingTagTextInhouse}>IN-HOUSE</Text>
                    </View>
                    <View style={[styles.statusDotMini, { backgroundColor: isInhouseRunning ? "#2E7D32" : "#94A3B8" }]} />
                  </View>

                  <Text style={[styles.hubDryingWeight, { color: "#1B5E20" }]} numberOfLines={1}>
                    {fmtNum(data?.today_arrival?.inhouse_processing_weight || 0, "", " KG")}
                  </Text>
                  <Text style={styles.hubDryingSubtitle}>Plant Dryers</Text>
                  <View style={styles.hubDryingBadge}>
                    <Text style={styles.hubDryingBadgeText}>
                      {data?.today_arrival?.inhouse_processing_batches_count && data.today_arrival.inhouse_processing_batches_count !== data.today_arrival.inhouse_processing_count
                        ? `${data.today_arrival.inhouse_processing_count} arrivals (${data.today_arrival.inhouse_processing_batches_count} lots)`
                        : `${data?.today_arrival?.inhouse_processing_count || 0} batches`} • {data?.inhouse_machines_running || 0} dryers
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Outsource Drying Tile */}
                <TouchableOpacity
                  style={[styles.hubDryingTile, { borderColor: "#FFE0B2", backgroundColor: "#FFFDF9" }]}
                  onPress={() => router.push({ pathname: "/batches", params: { status: "Drying" } })}
                  activeOpacity={0.85}
                >
                  <View style={styles.hubDryingTileHeader}>
                    <View style={styles.hubDryingTagOutsource}>
                      <MaterialCommunityIcons name="truck-delivery-outline" size={13} color="#E65100" />
                      <Text style={styles.hubDryingTagTextOutsource}>OUTSOURCE</Text>
                    </View>
                    <View style={[styles.statusDotMini, { backgroundColor: isOutsourceRunning ? "#E65100" : "#94A3B8" }]} />
                  </View>

                  <Text style={[styles.hubDryingWeight, { color: "#E65100" }]} numberOfLines={1}>
                    {fmtNum(data?.today_arrival?.outsourced_processing_weight || 0, "", " KG")}
                  </Text>
                  <Text style={styles.hubDryingSubtitle}>Vendor Contract</Text>
                  <View style={[styles.hubDryingBadge, { backgroundColor: "#FFF3E0" }]}>
                    <Text style={[styles.hubDryingBadgeText, { color: "#E65100" }]}>
                      {data?.today_arrival?.outsourced_processing_count || 0} batches • {data?.outsourced_machines_running || 0} vendors
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            {/* 4. Finance Summary Section (Hidden for Store Incharge) */}
            {role !== "Store Incharge" && (
              <>
                <View style={[styles.sectionHeaderRow, { marginTop: spacing.xl }]}>
                  <Text style={styles.sectionTitleText}>FINANCE SUMMARY</Text>
                  <Text style={styles.sectionDateText}>
                    {activePreset === "all" ? "All Time" : (start === end ? fmtDisplayDate(start) : `${fmtDisplayDate(start)} - ${fmtDisplayDate(end)}`)}
                  </Text>
                </View>
                <View style={styles.threeCardRow}>
                  <TouchableOpacity
                    testID="db-billed-kpi"
                    style={styles.smallKpiCard}
                    onPress={() => router.push("/batches")}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.kpiIconWrap, { backgroundColor: "#E3F2FD" }]}>
                      <MaterialCommunityIcons name="text-box-outline" size={18} color="#1565C0" />
                    </View>
                    <Text style={styles.smallKpiValue} numberOfLines={1}>{fmtNum((data as any)?.period_billed || 0, "₹")}</Text>
                    <Text style={styles.smallKpiLabel}>Total Billed</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    testID="db-collection-kpi"
                    style={styles.smallKpiCard}
                    onPress={() => router.push("/payments")}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.kpiIconWrap, { backgroundColor: "#E8F5E9" }]}>
                      <MaterialCommunityIcons name="currency-inr" size={18} color={colors.success} />
                    </View>
                    <Text style={styles.smallKpiValue} numberOfLines={1}>{fmtNum(data?.period_collection || 0, "₹")}</Text>
                    <Text style={styles.smallKpiLabel}>Collection</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    testID="db-pending-kpi"
                    style={styles.smallKpiCard}
                    onPress={() => router.push("/payment-picker")}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.kpiIconWrap, { backgroundColor: "#FFEBEE" }]}>
                      <MaterialCommunityIcons name="wallet-outline" size={18} color={colors.danger} />
                    </View>
                    <Text style={styles.smallKpiValue} numberOfLines={1}>{fmtNum(data?.pending_payments || 0, "₹")}</Text>
                    <Text style={styles.smallKpiLabel}>Pending</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* 4. Currently Processing Sections (In-House vs Outsource Separate Cards) */}
            {data?.today_arrival && (
              <View style={{ marginTop: spacing.md, marginBottom: spacing.md }}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitleText}>CURRENTLY PROCESSING</Text>
                  <Text style={styles.sectionDateText}>{activeBranchName}</Text>
                </View>

                {/* Card 1: In-House Dryers Processing */}
                <TouchableOpacity
                  onPress={() => router.push({ pathname: "/batches", params: { status: "Drying" } })}
                  style={[
                    styles.separateLiveCard,
                    { borderLeftColor: colors.primary, marginBottom: spacing.md },
                    !isInhouseRunning && styles.liveCardDisabled,
                  ]}
                  activeOpacity={0.85}
                >
                  <View style={styles.liveSeparateHeader}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={[styles.kpiIconWrap, { backgroundColor: "#E8F5E9" }]}>
                        <MaterialCommunityIcons name="factory" size={20} color={colors.primary} />
                      </View>
                      <View>
                        <Text style={[styles.liveSeparateTitle, { color: colors.primary }]}>In-House Dryers</Text>
                        <Text style={styles.liveSeparateSub}>Internal plant machinery</Text>
                      </View>
                    </View>
                    <View style={[styles.liveStatusPill, isInhouseRunning ? styles.livePillActive : styles.livePillIdle]}>
                      <View style={[styles.liveStatusDot, isInhouseRunning ? styles.liveDotActive : styles.liveDotIdle]} />
                      <Text style={[styles.liveStatusText, isInhouseRunning ? styles.liveTextActive : styles.liveTextIdle]}>
                        {isInhouseRunning ? "LIVE DRYING" : "IDLE"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.liveSeparateBody}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.liveSeparateWeight, { color: colors.text }]}>
                        {fmtNum(data.today_arrival.inhouse_processing_weight ?? 0, "", " KG")}
                      </Text>
                      <Text style={styles.liveSeparateSub}>
                        {data.today_arrival.inhouse_processing_batches_count && data.today_arrival.inhouse_processing_batches_count !== data.today_arrival.inhouse_processing_count
                          ? `${data.today_arrival.inhouse_processing_count} arrivals (${data.today_arrival.inhouse_processing_batches_count} lots)`
                          : `${data.today_arrival.inhouse_processing_count ?? 0} batches`} drying • {data.inhouse_machines_running ?? 0} dryers active
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textLight} />
                  </View>
                </TouchableOpacity>

                {/* Card 2: Outsource Dryers Processing */}
                <TouchableOpacity
                  onPress={() => router.push({ pathname: "/batches", params: { status: "Drying" } })}
                  style={[
                    styles.separateLiveCard,
                    { borderLeftColor: "#E65100" },
                    !isOutsourceRunning && styles.liveCardDisabled,
                  ]}
                  activeOpacity={0.85}
                >
                  <View style={styles.liveSeparateHeader}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={[styles.kpiIconWrap, { backgroundColor: "#FFF3E0" }]}>
                        <MaterialCommunityIcons name="truck-delivery-outline" size={20} color="#E65100" />
                      </View>
                      <View>
                        <Text style={[styles.liveSeparateTitle, { color: "#E65100" }]}>Outsource Dryers</Text>
                        <Text style={styles.liveSeparateSub}>Vendor contract processing</Text>
                      </View>
                    </View>
                    <View style={[styles.liveStatusPill, isOutsourceRunning ? styles.livePillOutsourceActive : styles.livePillIdle]}>
                      <View style={[styles.liveStatusDot, isOutsourceRunning ? styles.liveDotOutsourceActive : styles.liveDotIdle]} />
                      <Text style={[styles.liveStatusText, isOutsourceRunning ? styles.liveTextOutsourceActive : styles.liveTextIdle]}>
                        {isOutsourceRunning ? "LIVE DRYING" : "IDLE"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.liveSeparateBody}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.liveSeparateWeight, { color: "#E65100" }]}>
                        {fmtNum(data.today_arrival.outsourced_processing_weight ?? 0, "", " KG")}
                      </Text>
                      <Text style={styles.liveSeparateSub}>
                        {data.today_arrival.outsourced_processing_count ?? 0} batches drying • {data.outsourced_machines_running ?? 0} vendors active
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textLight} />
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {/* 5. Quick Actions Section */}
            <Text style={styles.sectionHeading}>Quick Actions</Text>
            <View style={styles.actionsContainer}>
              <TouchableOpacity style={styles.actionItem} onPress={() => router.push("/customer-form")}>
                <View style={[styles.actionIconWrap, { backgroundColor: "#E8F5E9" }]}>
                  <MaterialCommunityIcons name="account-plus" size={24} color={colors.primary} />
                </View>
                <Text style={styles.actionText}>New Customer</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionItem} onPress={() => router.push("/arrival-form")}>
                <View style={[styles.actionIconWrap, { backgroundColor: "#E3F2FD" }]}>
                  <MaterialCommunityIcons name="download" size={24} color="#1565C0" />
                </View>
                <Text style={styles.actionText}>Receive Stock</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionItem} onPress={() => router.push("/delivery-picker")}>
                <View style={[styles.actionIconWrap, { backgroundColor: "#F3E5F5" }]}>
                  <MaterialCommunityIcons name="upload" size={24} color="#7B1FA2" />
                </View>
                <Text style={styles.actionText}>Deliver Stock</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionItem} onPress={() => router.push("/payment-picker")}>
                <View style={[styles.actionIconWrap, { backgroundColor: "#FFF3E0" }]}>
                  <MaterialCommunityIcons name="cash-plus" size={24} color="#F57C00" />
                </View>
                <Text style={styles.actionText}>Collect Payment</Text>
              </TouchableOpacity>
            </View>

            {/* 6. Needs Attention Section */}
            <Text style={styles.sectionHeading}>Needs Attention</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.attentionScroll}>
              <TouchableOpacity
                onPress={() => router.push("/arrivals?tab=processing")}
                style={styles.attentionCard}
                activeOpacity={0.8}
              >
                <View style={[styles.attentionBadge, { backgroundColor: "#FFEBEE" }]}>
                  <MaterialCommunityIcons name="truck-delivery-outline" size={16} color={colors.danger} />
                </View>
                <Text style={styles.attentionVal}>{data?.pending_deliveries_count || 12} Batches</Text>
                <Text style={styles.attentionLabel}>Pending Deliveries</Text>
                <View style={styles.attentionStatusBadgeRed}>
                  <Text style={styles.attentionStatusTextRed}>High Priority</Text>
                </View>
              </TouchableOpacity>

              {role !== "Store Incharge" && (
                <TouchableOpacity
                  onPress={() => router.push("/payments")}
                  style={styles.attentionCard}
                  activeOpacity={0.8}
                >
                  <View style={[styles.attentionBadge, { backgroundColor: "#FFF3E0" }]}>
                    <MaterialCommunityIcons name="cash-remove" size={16} color="#F57C00" />
                  </View>
                  <Text style={styles.attentionVal}>{fmtNum(data?.pending_payments || 43250, "₹")}</Text>
                  <Text style={styles.attentionLabel}>Pending Payments</Text>
                  <View style={styles.attentionStatusBadgeOrange}>
                    <Text style={styles.attentionStatusTextOrange}>Pending Action</Text>
                  </View>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => router.push("/arrivals?tab=processing")}
                style={styles.attentionCard}
                activeOpacity={0.8}
              >
                <View style={[styles.attentionBadge, { backgroundColor: "#E8F5E9" }]}>
                  <MaterialCommunityIcons name="checkbox-marked-circle-outline" size={16} color={colors.success} />
                </View>
                <Text style={styles.attentionVal}>{data?.drying_completed_count || 6} Customers</Text>
                <Text style={styles.attentionLabel}>Drying Completed</Text>
                <View style={styles.attentionStatusBadgeGreen}>
                  <Text style={styles.attentionStatusTextGreen}>Ready to Load</Text>
                </View>
              </TouchableOpacity>
            </ScrollView>

            {/* 7. Business Performance Charts (Admin / Manager) */}
            {role !== "Store Incharge" && (
              <>
                <Text style={styles.sectionHeading}>Business Performance</Text>
                <View style={styles.chartsContainer}>
                  {/* Daily Collection Bar Chart */}
                  <View style={styles.chartCard}>
                    <Text style={styles.chartTitle}>Daily Collection</Text>
                    <Text style={styles.chartSubtitle}>Last 7 Days</Text>
                    
                    <View style={styles.barChartContainer}>
                      {getDailyCollections().daily.map((val, idx) => {
                        const maxVal = Math.max(...getDailyCollections().daily);
                        const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
                        return (
                          <View key={idx} style={styles.barCol}>
                            <View style={styles.barTrack}>
                              <View style={[styles.barFill, { height: `${pct}%`, backgroundColor: colors.primary }]} />
                            </View>
                            <Text style={styles.barLabel}>{getDailyCollections().labels[idx]}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>

                  {/* Received vs Delivered Dual Bar Chart */}
                  <View style={styles.chartCard}>
                    <Text style={styles.chartTitle}>Received vs Delivered</Text>
                    <Text style={styles.chartSubtitle}>Last 7 Days (KG)</Text>

                    <View style={styles.barChartContainer}>
                      {getReceivedVsDelivered().rec.map((val, idx) => {
                        const delVal = getReceivedVsDelivered().del[idx];
                        const maxVal = Math.max(...getReceivedVsDelivered().rec, ...getReceivedVsDelivered().del);
                        const recPct = maxVal > 0 ? (val / maxVal) * 100 : 0;
                        const delPct = maxVal > 0 ? (delVal / maxVal) * 100 : 0;
                        return (
                          <View key={idx} style={styles.barCol}>
                            <View style={styles.dualBarTrack}>
                              <View style={[styles.barFill, { height: `${recPct}%`, backgroundColor: "#1565C0", width: 4 }]} />
                              <View style={[styles.barFill, { height: `${delPct}%`, backgroundColor: "#7B1FA2", width: 4 }]} />
                            </View>
                            <Text style={styles.barLabel}>{getReceivedVsDelivered().labels[idx]}</Text>
                          </View>
                        );
                      })}
                    </View>
                    <View style={styles.chartLegend}>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: "#1565C0" }]} />
                        <Text style={styles.legendText}>Rec</Text>
                      </View>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: "#7B1FA2" }]} />
                        <Text style={styles.legendText}>Del</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </>
            )}

            {/* 8. Recent Activity Transactions */}
            <View style={styles.activitySection}>
              <View style={styles.activityHeader}>
                <Text style={styles.sectionHeadingNoMargin}>Recent Activity</Text>
                <TouchableOpacity onPress={() => router.push("/audit")} activeOpacity={0.7}>
                  <Text style={styles.viewAllText}>View All</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.activityList}>
                {(data?.recent_activities || []).slice(0, 3).map((act, idx) => {
                  let icon = "circle-outline";
                  let color = colors.primary;
                  let titleStr = "Operation Logged";
                  let bodyStr = "";

                  if (act.entity === "batch") {
                    if (act.action === "create_batch") {
                      icon = "download";
                      color = "#1565C0";
                      titleStr = `Received: ${fmtNum(act.after?.raw_weight || 0, "", " KG")}`;
                      bodyStr = `Farmer: ${act.after?.customer_name || "Unknown"}`;
                    } else if (act.action === "delivery_batch") {
                      icon = "upload";
                      color = "#7B1FA2";
                      titleStr = `Delivered: ${fmtNum(act.after?.actual_dry_weight || 0, "", " KG")}`;
                      bodyStr = `Customer: ${act.after?.customer_name || "Unknown"}`;
                    } else {
                      icon = "tumble-dryer";
                      color = colors.warning;
                      titleStr = "Batch Status Updated";
                      bodyStr = `Batch: ${act.after?.batch_no || "Details"}`;
                    }
                  } else if (act.entity === "payment") {
                    icon = "currency-inr";
                    color = colors.success;
                    titleStr = `Payment Collected: ${fmtNum(act.after?.amount || 0, "₹")}`;
                    bodyStr = "Transaction recorded";
                  }

                  const timeStr = new Date(act.timestamp).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  });

                  return (
                    <View key={act.id || idx} style={styles.activityRow}>
                      <View style={[styles.actIconWrap, { backgroundColor: `${color}12` }]}>
                        <MaterialCommunityIcons name={icon as any} size={18} color={color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.actTitle}>{titleStr}</Text>
                        <Text style={styles.actBody}>{bodyStr}</Text>
                      </View>
                      <Text style={styles.actTime}>{timeStr}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        )}
      </ScrollView>



      {/* Admin Branch Picker Modal */}
      <Modal
        visible={branchModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setBranchModalOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setBranchModalOpen(false)}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Switch Branch</Text>
              <TouchableOpacity onPress={() => setBranchModalOpen(false)}>
                <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll} bounces={false}>
              <TouchableOpacity
                onPress={() => handleSelectBranch("")}
                style={[styles.modalItem, !selectedBranchId && styles.modalItemSelected]}
              >
                <Text style={[styles.modalItemText, !selectedBranchId && styles.modalItemTextSelected]}>All Branches</Text>
                {!selectedBranchId && <MaterialCommunityIcons name="check" size={18} color={colors.primary} />}
              </TouchableOpacity>
              {branches.map(b => (
                <TouchableOpacity
                  key={b.id}
                  onPress={() => handleSelectBranch(b.id)}
                  style={[styles.modalItem, selectedBranchId === b.id && styles.modalItemSelected]}
                >
                  <Text style={[styles.modalItemText, selectedBranchId === b.id && styles.modalItemTextSelected]}>{b.name}</Text>
                  {selectedBranchId === b.id && <MaterialCommunityIcons name="check" size={18} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Custom Date Range Picker Modal */}
      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={styles.dateModalBg}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerSheetHandle} />
            <Text style={styles.pickerSheetTitle}>Select Date Range</Text>

            <Calendar
              startDate={draftStart}
              endDate={draftEnd}
              onSelectRange={(s, e) => {
                setDraftStart(s);
                setDraftEnd(e);
              }}
            />

            <View style={styles.dateRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dateLabel}>From</Text>
                <TextInput
                  testID="dashboard-start-date"
                  style={styles.dateInput}
                  value={draftStart}
                  onChangeText={setDraftStart}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textLight}
                />
              </View>
              <MaterialCommunityIcons name="arrow-right" size={18} color={colors.textMuted} style={{ marginTop: 22 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.dateLabel}>To</Text>
                <TextInput
                  testID="dashboard-end-date"
                  style={styles.dateInput}
                  value={draftEnd}
                  onChangeText={setDraftEnd}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textLight}
                />
              </View>
            </View>

            <View style={styles.pickerSheetActions}>
              <TouchableOpacity testID="range-cancel" style={styles.pickerSheetCancel} onPress={() => setPickerOpen(false)}>
                <Text style={styles.pickerSheetCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="range-apply" style={styles.pickerSheetApply} onPress={applyRange}>
                <Text style={styles.pickerSheetApplyText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* In-App Alerts & Notifications Drawer/Modal */}
      <Modal
        visible={alertsModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setAlertsModalOpen(false)}
      >
        <View style={styles.alertModalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAlertsModalOpen(false)} />
          <View style={styles.alertSheet}>
            <View style={styles.alertSheetHandle} />
            <View style={styles.alertSheetHeader}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={styles.alertSheetTitle}>Alerts & Notifications</Text>
                  {alertItems.length > 0 && (
                    <View style={styles.alertCountPill}>
                      <Text style={styles.alertCountPillText}>{alertItems.length} Action Needed</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.alertSheetSubtitle}>
                  Role: {role} • Branch: {activeBranchName}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setAlertsModalOpen(false)}
                style={styles.alertCloseBtn}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 28 }}>
              {/* 1. Action Items */}
              <Text style={styles.alertSectionHeading}>OPERATIONAL ALERTS</Text>

              {alertItems.length === 0 ? (
                <View style={styles.alertEmptyCard}>
                  <MaterialCommunityIcons name="check-circle-outline" size={40} color={colors.primary} />
                  <Text style={styles.alertEmptyTitle}>All Caught Up!</Text>
                  <Text style={styles.alertEmptySub}>
                    No pending drying completions, backlogs, or urgent alerts for this branch.
                  </Text>
                </View>
              ) : (
                alertItems.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.alertCard, { borderLeftColor: item.color }]}
                    onPress={() => handleAlertAction(item.route)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.alertCardIconWrap, { backgroundColor: `${item.color}15` }]}>
                      <MaterialCommunityIcons name={item.icon} size={22} color={item.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <Text style={styles.alertCardTitle}>{item.title}</Text>
                        {item.badgeText && (
                          <View style={[styles.alertCardBadge, { backgroundColor: `${item.color}15` }]}>
                            <Text style={[styles.alertCardBadgeText, { color: item.color }]}>{item.badgeText}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.alertCardDesc}>{item.desc}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 4 }}>
                        <Text style={[styles.alertCardActionText, { color: item.color }]}>Take Action</Text>
                        <MaterialCommunityIcons name="arrow-right" size={14} color={item.color} />
                      </View>
                    </View>
                  </TouchableOpacity>
                ))
              )}

              {/* 2. Live Activity Feed */}
              <Text style={[styles.alertSectionHeading, { marginTop: spacing.lg }]}>RECENT ACTIVITIES</Text>
              {(data?.recent_activities || []).slice(0, 4).length === 0 ? (
                <Text style={styles.noActivityText}>No recent activity logged for this period.</Text>
              ) : (
                (data?.recent_activities || []).slice(0, 4).map((act: any, idx: number) => (
                  <View key={idx} style={styles.activityFeedItem}>
                    <View style={styles.activityFeedBullet} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.activityFeedText}>
                        {act.user_name ? `${act.user_name} • ` : ""}
                        {act.action ? act.action.replace(/_/g, " ") : "Activity"}
                      </Text>
                      <Text style={styles.activityFeedDate}>
                        {act.timestamp ? new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Just now"}
                      </Text>
                    </View>
                  </View>
                ))
              )}

              {/* 3. Push Notifications Info */}
              <View style={styles.pushInfoBox}>
                <MaterialCommunityIcons name="cellphone-sound" size={20} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pushInfoTitle}>Push Notifications</Text>
                  <Text style={styles.pushInfoDesc}>
                    Mobile alerts are tailored by access level ({role}). Factory operators receive batch & dryer alerts, while management receives balance and billing summaries.
                  </Text>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  greeting: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: "600",
  },
  userName: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
    marginTop: 2,
    letterSpacing: -0.3,
  },
  roleBranchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: spacing.sm,
  },
  roleBadge: {
    backgroundColor: colors.primary50,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  roleText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.primary,
  },
  branchSelectTrigger: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    gap: 3,
  },
  branchSelectText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
    maxWidth: 120,
  },
  branchStaticBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 3,
  },
  branchStaticText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.textMuted,
    maxWidth: 120,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  syncBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  notificationBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    position: "relative",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
    position: "absolute",
    top: 8,
    right: 8,
    borderWidth: 1.5,
    borderColor: "#ffffff",
  },
  unreadDotBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.danger,
    position: "absolute",
    top: -2,
    right: -2,
    borderWidth: 1.5,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  unreadDotBadgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "900",
  },
  alertModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  alertSheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "82%",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    ...shadow.card,
  },
  alertSheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  alertSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.md,
    marginBottom: spacing.md,
  },
  alertSheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  alertCountPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: "#FEE2E2",
  },
  alertCountPillText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.danger,
  },
  alertSheetSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "600",
    marginTop: 2,
  },
  alertCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  alertSectionHeading: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  alertEmptyCard: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
    paddingHorizontal: spacing.lg,
    backgroundColor: "#F0FDF4",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#DCFCE7",
  },
  alertEmptyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.primary,
    marginTop: 8,
  },
  alertEmptySub: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 17,
  },
  alertCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#ffffff",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
    ...shadow.card,
  },
  alertCardIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  alertCardTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
    flex: 1,
    marginRight: 6,
  },
  alertCardBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  alertCardBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  alertCardDesc: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 3,
    lineHeight: 17,
  },
  alertCardActionText: {
    fontSize: 12,
    fontWeight: "800",
  },
  activityFeedItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    gap: 10,
  },
  activityFeedBullet: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.primary,
  },
  activityFeedText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    textTransform: "capitalize",
  },
  activityFeedDate: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  noActivityText: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: "italic",
    paddingVertical: 6,
  },
  pushInfoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  pushInfoTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.text,
  },
  pushInfoDesc: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 15,
  },
  avatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
  },
  avatarInitials: {
    fontSize: 14,
    fontWeight: "800",
    color: "#ffffff",
  },
  dateFilterContainer: {
    paddingVertical: spacing.md,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dateScroll: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  datePill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
  },
  datePillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  datePillText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
  },
  datePillTextActive: {
    color: "#ffffff",
    fontWeight: "700",
  },
  loadingContainer: {
    paddingVertical: 80,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
  },
  dashboardContent: {
    paddingTop: spacing.lg,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    marginTop: spacing.lg,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  sectionHeadingNoMargin: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  kpiCard: {
    width: (width - spacing.xl * 2 - spacing.md) / 2,
    backgroundColor: "#ffffff",
    borderRadius: radius.xl,
    padding: spacing.md + 2,
    ...shadow.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  kpiIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.3,
  },
  kpiLabel: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "600",
    marginTop: 2,
  },
  trendRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 2,
  },
  trendText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.success,
  },
  liveCard: {
    marginHorizontal: spacing.xl,
    backgroundColor: "#ffffff",
    borderRadius: radius.xxl,
    padding: spacing.xl,
    marginTop: spacing.xl,
    ...shadow.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  liveCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.md,
    marginBottom: spacing.md,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFEBE6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.danger,
  },
  liveBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.danger,
    letterSpacing: 0.5,
  },
  liveCardTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
  },
  liveCardBranchSubtitle: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textMuted,
    marginTop: 1,
  },
  processingSplitGrid: {
    flexDirection: "row",
    gap: 10,
    marginVertical: spacing.md,
  },
  processingSplitCard: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 3.5,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  splitCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 4,
  },
  splitCardTagInhouse: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 0.3,
  },
  splitCardTagOutsource: {
    fontSize: 10,
    fontWeight: "800",
    color: "#E65100",
    letterSpacing: 0.3,
  },
  splitWeightValue: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  splitSubText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.textMuted,
  },
  kpiSubBreakdown: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.textMuted,
    marginTop: 2,
  },
  liveStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    marginVertical: spacing.sm,
  },
  liveStat: {
    alignItems: "center",
  },
  liveStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
  },
  liveStatLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "600",
  },
  liveStatValue: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
    marginTop: 2,
  },
  progressContainer: {
    marginTop: spacing.md,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "600",
  },
  progressValText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  liveCardBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  etaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  etaText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "600",
  },
  etaHighlight: {
    color: colors.text,
    fontWeight: "700",
  },
  liveCardBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    gap: 4,
  },
  liveCardBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  actionsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xs,
  },
  actionItem: {
    alignItems: "center",
    width: (width - spacing.xl * 2 - spacing.sm * 3) / 4,
  },
  actionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 6,
  },
  actionText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
  },
  attentionScroll: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
    paddingBottom: 4,
  },
  attentionCard: {
    width: 140,
    backgroundColor: "#ffffff",
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  attentionBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  attentionVal: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  attentionLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "600",
    marginTop: 2,
    height: 32,
  },
  attentionStatusBadgeRed: {
    backgroundColor: "#FFEBEE",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  attentionStatusTextRed: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.danger,
  },
  attentionStatusBadgeOrange: {
    backgroundColor: "#FFF3E0",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  attentionStatusTextOrange: {
    fontSize: 9,
    fontWeight: "700",
    color: "#F57C00",
  },
  attentionStatusBadgeGreen: {
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  attentionStatusTextGreen: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.success,
  },
  chartsContainer: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  chartCard: {
    backgroundColor: "#ffffff",
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  chartSubtitle: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  barChartContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    height: 120,
    marginTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  barCol: {
    alignItems: "center",
    flex: 1,
  },
  barTrack: {
    height: 90,
    width: 8,
    backgroundColor: colors.bg,
    borderRadius: 4,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  dualBarTrack: {
    height: 90,
    width: 14,
    backgroundColor: colors.bg,
    borderRadius: 4,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-end",
    overflow: "hidden",
    paddingBottom: 2,
  },
  barFill: {
    borderRadius: 4,
  },
  barLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textMuted,
    marginTop: 6,
  },
  chartLegend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.textMuted,
  },
  activitySection: {
    marginHorizontal: spacing.xl,
    backgroundColor: "#ffffff",
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  activityHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
  },
  activityList: {
    gap: spacing.md,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  actIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  actTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  actBody: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  actTime: {
    fontSize: 11,
    color: colors.textLight,
    fontWeight: "600",
  },
  fabContainer: {
    position: "absolute",
    bottom: 24,
    right: 24,
    alignItems: "flex-end",
    zIndex: 99,
  },
  mainFab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  fabOptions: {
    marginBottom: spacing.sm,
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  fabOptionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  fabOptionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
    backgroundColor: "#ffffff",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  fabMiniBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 27, 20, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  modalCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#ffffff",
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.card,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  modalScroll: {
    maxHeight: 280,
  },
  modalItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: 4,
  },
  modalItemSelected: {
    backgroundColor: colors.primary50,
  },
  modalItemText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.text,
  },
  modalItemTextSelected: {
    color: colors.primary,
    fontWeight: "700",
  },
  dateModalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  pickerSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  pickerSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  pickerSheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    marginBottom: spacing.md,
    textAlign: "center",
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.lg,
    marginTop: spacing.md,
  },
  dateLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textMuted,
    marginBottom: 6,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  dateInput: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerSheetActions: {
    flexDirection: "row",
    gap: spacing.md,
  },
  pickerSheetCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
  },
  pickerSheetCancelText: {
    color: colors.textMuted,
    fontWeight: "700",
  },
  pickerSheetApply: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  pickerSheetApplyText: {
    color: "#fff",
    fontWeight: "800",
  },
  /* Unified Produce & Drying Operations Hub */
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    marginBottom: spacing.xs + 2,
  },
  sectionTitleText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#334155",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  sectionDateText: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
  },
  produceHubContainer: {
    marginHorizontal: spacing.xl,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    ...shadow.card,
    overflow: "hidden",
    marginBottom: spacing.md,
  },
  hubInOutRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "#F8FAFC",
  },
  hubInOutCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  hubIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  hubMicroLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  hubMainWeight: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: -0.3,
  },
  hubInOutDivider: {
    width: 1,
    height: 36,
    backgroundColor: "#E2E8F0",
    marginHorizontal: 10,
  },
  hubSpicesSection: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 10,
  },
  hubSpicesHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  hubSpicesTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: "#15803D",
    letterSpacing: 0.8,
  },
  hubSpicesSubtitle: {
    fontSize: 10,
    fontWeight: "600",
    color: "#64748B",
  },
  hubSpicesScroll: {
    paddingHorizontal: 16,
    gap: 10,
  },
  hubSpiceCard: {
    minWidth: 125,
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 10,
    justifyContent: "space-between",
  },
  hubSpiceCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  hubSpiceIconBox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  hubSpiceBatchBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  hubSpiceBatchText: {
    fontSize: 9,
    fontWeight: "700",
  },
  hubSpiceName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 2,
  },
  hubSpiceWeight: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  hubDivisionBar: {
    backgroundColor: "#F1F5F9",
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#E2E8F0",
  },
  hubDivisionTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: "#475569",
    letterSpacing: 0.8,
  },
  hubDryingGrid: {
    flexDirection: "row",
    padding: 12,
    gap: 10,
    backgroundColor: "#FFFFFF",
  },
  hubDryingTile: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    justifyContent: "space-between",
    minHeight: 115,
  },
  hubDryingTileHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  hubDryingTagInhouse: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  hubDryingTagTextInhouse: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#2E7D32",
    letterSpacing: 0.5,
  },
  hubDryingTagOutsource: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFF3E0",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  hubDryingTagTextOutsource: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#E65100",
    letterSpacing: 0.5,
  },
  statusDotMini: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  hubDryingWeight: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  hubDryingSubtitle: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
    marginTop: 2,
  },
  hubDryingBadge: {
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginTop: 8,
  },
  hubDryingBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#2E7D32",
  },

  /* Finance 3-card Row */
  threeCardRow: {
    flexDirection: "row",
    marginHorizontal: spacing.xl,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },

  /* Professional Live Processing Separate Cards */
  separateLiveCard: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.card,
    borderRadius: radius.xxl,
    padding: spacing.lg,
    borderLeftWidth: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadow.card,
  },
  liveSeparateHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  liveSeparateTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  liveSeparateBody: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  liveSeparateWeight: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  liveSeparateSub: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "600",
    marginTop: 2,
  },
  liveStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  liveStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveStatusText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  livePillActive: {
    backgroundColor: "#E8F5E9",
  },
  liveDotActive: {
    backgroundColor: colors.primary,
  },
  liveTextActive: {
    color: colors.primary,
  },
  livePillOutsourceActive: {
    backgroundColor: "#FFF3E0",
  },
  liveDotOutsourceActive: {
    backgroundColor: "#E65100",
  },
  liveTextOutsourceActive: {
    color: "#E65100",
  },
  livePillIdle: {
    backgroundColor: "#F1F5F9",
  },
  liveDotIdle: {
    backgroundColor: colors.textLight,
  },
  liveTextIdle: {
    color: colors.textMuted,
  },
  smallKpiCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.md,
    alignItems: "center",
    ...shadow.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  smallKpiValue: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.text,
    marginTop: 6,
    textAlign: "center",
  },
  smallKpiLabel: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
    fontWeight: "700",
    textAlign: "center",
  },
  liveCardDisabled: {
    opacity: 0.85,
  },
  inactiveBadge: {
    backgroundColor: colors.bg,
  },
  inactiveDot: {
    backgroundColor: colors.textLight,
  },
  inactiveBadgeText: {
    color: colors.textMuted,
  },
  noDryerContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  noDryerText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  noDryerSubtext: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
  },
});
