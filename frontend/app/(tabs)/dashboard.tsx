import React, { useState, useCallback, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Image, Modal, Pressable, Platform, Dimensions, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import Calendar from "@/src/components/Calendar";
import { colors, radius, shadow, spacing } from "@/src/theme";

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
  total_machines: number;
  recent_activities: any[];
};

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
];

export default function Dashboard() {
  const { user, branches, selectedBranchId, setSelectedBranchId } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState(todayISO());
  const [activePreset, setActivePreset] = useState("today");
  
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(start);
  const [draftEnd, setDraftEnd] = useState(end);

  const role = user?.role || "Store Incharge";
  const userBranchName = user?.branch_id
    ? branches.find(b => b.id === user.branch_id)?.name || "My Branch"
    : "All Branches";

  const activeBranchName = selectedBranchId
    ? branches.find(b => b.id === selectedBranchId)?.name || "Selected Branch"
    : "All Branches";

  const load = useCallback(async (s = start, e = end, bid = selectedBranchId) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("start", s);
      qs.set("end", e);
      if (bid) qs.set("branch_id", bid);
      const d = await api<Dash>(`/dashboard?${qs.toString()}`);
      setData(d);
    } catch (err) {
      console.error("Dashboard data load failure:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedBranchId]);

  useFocusEffect(
    useCallback(() => {
      load(start, end, selectedBranchId);
    }, [load, start, end, selectedBranchId])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load(start, end, selectedBranchId);
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
          <TouchableOpacity style={styles.notificationBtn} activeOpacity={0.7}>
            <MaterialCommunityIcons name="bell-outline" size={24} color={colors.text} />
            <View style={styles.unreadDot} />
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
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Fetching active reports...</Text>
          </View>
        ) : (
          <View style={styles.dashboardContent}>
            {/* 3. Produce Summary Section */}
            <Text style={styles.sectionHeading}>
              Produce Summary ({start === end ? fmtDisplayDate(start) : `${fmtDisplayDate(start)} - ${fmtDisplayDate(end)}`})
            </Text>
            <View style={styles.threeCardRow}>
              <View style={styles.smallKpiCard}>
                <View style={[styles.kpiIconWrap, { backgroundColor: `${colors.primary}12` }]}>
                  <MaterialCommunityIcons name="download" size={18} color={colors.primary} />
                </View>
                <Text style={styles.smallKpiValue} numberOfLines={1}>{fmtNum(data?.period_received_weight || 0, "", " KG")}</Text>
                <Text style={styles.smallKpiLabel}>Received</Text>
              </View>

              <View style={styles.smallKpiCard}>
                <View style={[styles.kpiIconWrap, { backgroundColor: "#FFF3E0" }]}>
                  <MaterialCommunityIcons name="engine-outline" size={18} color="#E65100" />
                </View>
                <Text style={styles.smallKpiValue} numberOfLines={1}>{fmtNum(data?.today_arrival?.processing_weight || 0, "", " KG")}</Text>
                <Text style={styles.smallKpiLabel}>Processing</Text>
              </View>

              <View style={styles.smallKpiCard}>
                <View style={[styles.kpiIconWrap, { backgroundColor: "#F3E5F5" }]}>
                  <MaterialCommunityIcons name="upload" size={18} color="#7B1FA2" />
                </View>
                <Text style={styles.smallKpiValue} numberOfLines={1}>{fmtNum(data?.period_delivered_weight || 0, "", " KG")}</Text>
                <Text style={styles.smallKpiLabel}>Delivered</Text>
              </View>
            </View>

            {/* 4. Finance Summary Section (Hidden for Store Incharge) */}
            {role !== "Store Incharge" && (
              <>
                <Text style={[styles.sectionHeading, { marginTop: spacing.lg }]}>
                  Finance Summary ({start === end ? fmtDisplayDate(start) : `${fmtDisplayDate(start)} - ${fmtDisplayDate(end)}`})
                </Text>
                <View style={styles.threeCardRow}>
                  <View style={styles.smallKpiCard}>
                    <View style={[styles.kpiIconWrap, { backgroundColor: "#E3F2FD" }]}>
                      <MaterialCommunityIcons name="text-box-outline" size={18} color="#1565C0" />
                    </View>
                    <Text style={styles.smallKpiValue} numberOfLines={1}>{fmtNum((data as any)?.period_billed || 0, "₹")}</Text>
                    <Text style={styles.smallKpiLabel}>Total Billed</Text>
                  </View>

                  <View style={styles.smallKpiCard}>
                    <View style={[styles.kpiIconWrap, { backgroundColor: "#E8F5E9" }]}>
                      <MaterialCommunityIcons name="currency-inr" size={18} color={colors.success} />
                    </View>
                    <Text style={styles.smallKpiValue} numberOfLines={1}>{fmtNum(data?.period_collection || 0, "₹")}</Text>
                    <Text style={styles.smallKpiLabel}>Collection</Text>
                  </View>

                  <View style={styles.smallKpiCard}>
                    <View style={[styles.kpiIconWrap, { backgroundColor: "#FFEBEE" }]}>
                      <MaterialCommunityIcons name="wallet-outline" size={18} color={colors.danger} />
                    </View>
                    <Text style={styles.smallKpiValue} numberOfLines={1}>{fmtNum(data?.pending_payments || 0, "₹")}</Text>
                    <Text style={styles.smallKpiLabel}>Pending</Text>
                  </View>
                </View>
              </>
            )}

            {/* 4. Live Processing Card (Primary Card) */}
            <View style={styles.liveCard}>
              <View style={styles.liveCardTop}>
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveBadgeText}>LIVE DRYING</Text>
                </View>
                <Text style={styles.liveCardTitle}>Currently Processing</Text>
              </View>

              <View style={styles.liveStatsRow}>
                <View style={styles.liveStat}>
                  <Text style={styles.liveStatLabel}>Customers in Dryer</Text>
                  <Text style={styles.liveStatValue}>{data?.today_arrival.processing_count || 18}</Text>
                </View>
                <View style={styles.liveStatDivider} />
                <View style={styles.liveStat}>
                  <Text style={styles.liveStatLabel}>Total Weight</Text>
                  <Text style={styles.liveStatValue}>{fmtNum(data?.today_arrival.processing_weight || 4250, "", " KG")}</Text>
                </View>
              </View>

              <View style={styles.progressContainer}>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressLabel}>Dryer Capacity Utilization</Text>
                  <Text style={styles.progressValText}>
                    {data?.today_arrival.processing_weight ? Math.round(data.today_arrival.processing_weight) : 4200} / 5000 KG (84%)
                  </Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${Math.min(
                          100,
                          data?.today_arrival.processing_weight
                            ? (data.today_arrival.processing_weight / 5000) * 100
                            : 84
                        )}%`,
                      },
                    ]}
                  />
                </View>
              </View>

              <View style={styles.liveCardBottom}>
                <View style={styles.etaRow}>
                  <MaterialCommunityIcons name="clock-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.etaText}>Estimated Completion: <Text style={styles.etaHighlight}>Today 5:30 PM</Text></Text>
                </View>

                <TouchableOpacity
                  onPress={() => router.push({ pathname: "/batches", params: { status: "Drying" } })}
                  style={styles.liveCardBtn}
                  activeOpacity={0.8}
                >
                  <Text style={styles.liveCardBtnText}>View Customer Details</Text>
                  <MaterialCommunityIcons name="arrow-right" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

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

              {role !== "Store Incharge" && (
                <TouchableOpacity style={styles.actionItem} onPress={() => router.push("/payment-picker")}>
                  <View style={[styles.actionIconWrap, { backgroundColor: "#FFF3E0" }]}>
                    <MaterialCommunityIcons name="cash-plus" size={24} color="#F57C00" />
                  </View>
                  <Text style={styles.actionText}>Collect Payment</Text>
                </TouchableOpacity>
              )}
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
    gap: spacing.md,
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
  threeCardRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
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
});
