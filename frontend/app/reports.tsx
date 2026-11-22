import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Platform,
  RefreshControl,
} from "react-native";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useSegments } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { useToast } from "@/src/components/Toast";

type ReportTab = "summary" | "machines" | "customers" | "payments" | "expenses" | "outsourced";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

export default function Reports() {
  const router = useRouter();
  const segments = useSegments();
  const toast = useToast();
  const { selectedBranchId, branches } = useAuth();

  const [activeTab, setActiveTab] = useState<ReportTab>("summary");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Data sets
  const [summaryData, setSummaryData] = useState<any>(null);
  const [machinesData, setMachinesData] = useState<any[]>([]);
  const [customersData, setCustomersData] = useState<any[]>([]);
  const [paymentsData, setPaymentsData] = useState<any[]>([]);
  const [expensesData, setExpensesData] = useState<any[]>([]);

  // Search filter
  const [q, setQ] = useState("");

  const isTab = (segments as string[]).includes("(tabs)");
  const activeBranchName = selectedBranchId
    ? (branches.find(b => b.id === selectedBranchId)?.name || "Branch")
    : "All Branches";

  // Load summary
  const loadSummary = useCallback(async (bid = selectedBranchId) => {
    try {
      const qs = bid ? `?branch_id=${bid}` : "";
      const res = await api<any>(`/reports/summary${qs}`);
      setSummaryData(res);
    } catch (e: any) {
      console.warn("Summary load failure:", e?.message);
    }
  }, [selectedBranchId]);

  // Load detailed reports on demand or tab switch
  const loadTabReport = useCallback(async (tab: ReportTab, bid = selectedBranchId) => {
    const qs = bid ? `?branch_id=${bid}` : "";
    try {
      if (tab === "machines" || tab === "outsourced") {
        const res = await api<any[]>(`/reports/machine-wise${qs}`);
        setMachinesData(res || []);
      } else if (tab === "customers") {
        const res = await api<any[]>(`/reports/customer-wise${qs}`);
        setCustomersData(res || []);
      } else if (tab === "payments") {
        const res = await api<any[]>(`/reports/payments${qs}`);
        setPaymentsData(res || []);
      } else if (tab === "expenses") {
        const res = await api<any[]>(`/reports/expenses${qs}`);
        setExpensesData(res || []);
      }
    } catch (e: any) {
      toast.show(e?.message || `Failed to load ${tab} report`, "error");
    }
  }, [selectedBranchId, toast]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadSummary(selectedBranchId),
        loadTabReport(activeTab, selectedBranchId),
      ]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedBranchId, activeTab, loadSummary, loadTabReport]);

  useFocusEffect(useCallback(() => {
    loadAll();
  }, [loadAll]));

  const handleTabChange = (tab: ReportTab) => {
    setActiveTab(tab);
    setQ("");
    setLoading(true);
    loadTabReport(tab, selectedBranchId).finally(() => setLoading(false));
  };

  // ==================== CSV EXPORT LOGIC ====================
  const handleExportCSV = async () => {
    try {
      setExporting(true);
      let csvContent = "";
      let filename = "";
      const branchSlug = activeBranchName.replace(/\s+/g, "_");
      const dateSlug = todayISO();

      if (activeTab === "machines") {
        filename = `E3_Machine_Report_${branchSlug}_${dateSlug}.csv`;
        csvContent = [
          "Machine Name,Type,Capacity (kg),Status,Branch,Batches,Active,Completed,Total Wet (kg),Total Dry (kg),Yield %,Vendor,Vendor Rate,Total Cost,Total Paid,Balance Payable",
          ...filteredMachines.map(m =>
            `"${m.machine_name}","${m.is_outsourced ? "Outsourced" : "In-House"}",${m.capacity},"${m.status}","${m.branch_name || ""}",${m.total_batches},${m.active_batches},${m.completed_batches},${m.total_wet_weight},${m.total_dry_weight},${m.yield_pct}%,"${m.vendor_name || ""}",${m.vendor_rate_per_kg},${m.total_cost},${m.total_paid},${m.balance_payable}`
          ),
        ].join("\n");
      } else if (activeTab === "outsourced") {
        filename = `E3_Outsourced_Drying_${branchSlug}_${dateSlug}.csv`;
        csvContent = [
          "Machine Name,Vendor Name,Phone,Vendor Rate (Rs/kg),Batches,Processed Wet (kg),Total Cost (Rs),Total Paid (Rs),Balance Payable (Rs),Branch",
          ...filteredOutsourced.map(m =>
            `"${m.machine_name}","${m.vendor_name || ""}",${m.vendor_phone || ""},${m.vendor_rate_per_kg},${m.total_batches},${m.total_wet_weight},${m.total_cost},${m.total_paid},${m.balance_payable},"${m.branch_name || ""}"`
          ),
        ].join("\n");
      } else if (activeTab === "customers") {
        filename = `E3_Customer_Report_${branchSlug}_${dateSlug}.csv`;
        csvContent = [
          "Customer Name,Code,Phone,Branch,Total Batches,Total Wet (kg),Delivered Dry (kg),Avg Padi (g/L),Total Billed (Rs),Total Paid (Rs),Pending Balance (Rs)",
          ...filteredCustomers.map(c =>
            `"${c.customer_name}","${c.customer_code || ""}","${c.customer_mobile || ""}","${c.branch_name || ""}",${c.total_batches},${c.total_wet_weight},${c.total_dry_weight},${c.avg_padi_weight},${c.total_billed},${c.total_paid},${c.balance_amount}`
          ),
        ].join("\n");
      } else if (activeTab === "payments") {
        filename = `E3_Payments_Report_${branchSlug}_${dateSlug}.csv`;
        csvContent = [
          "Date,Receipt ID,Customer Name,Code,Mobile,Batch No,Amount (Rs),Payment Mode,Remarks,Branch,Recorded By",
          ...filteredPayments.map(p =>
            `"${fmtDate(p.created_at)}","${p.id.slice(0, 8).toUpperCase()}","${p.customer_name || ""}","${p.customer_code || ""}","${p.customer_mobile || ""}","${p.batch_no || ""}",${p.amount},"${p.mode || ""}","${(p.remarks || "").replace(/"/g, '""')}","${p.branch_name || ""}","${p.created_by_name || ""}"`
          ),
        ].join("\n");
      } else if (activeTab === "expenses") {
        filename = `E3_Expenses_Report_${branchSlug}_${dateSlug}.csv`;
        csvContent = [
          "Date,Category,Amount (Rs),Vendor/Payee,Machine,Payment Mode,Remarks,Branch,Recorded By",
          ...filteredExpenses.map(e =>
            `"${e.expense_date || ""}","${e.category || ""}",${e.amount},"${(e.vendor || "").replace(/"/g, '""')}","${e.machine_name || ""}","${e.payment_mode || ""}","${(e.remarks || "").replace(/"/g, '""')}","${e.branch_name || ""}","${e.created_by_name || ""}"`
          ),
        ].join("\n");
      } else {
        // Summary tab export
        filename = `E3_Operations_Summary_${branchSlug}_${dateSlug}.csv`;
        csvContent = [
          "Metric,Value",
          `Overall Wet Arrival (kg),${summaryData?.total_wet_arrival || 0}`,
          `Processed Dry (kg),${summaryData?.total_processed_dry || 0}`,
          `Delivered Dry (kg),${summaryData?.total_delivered_dry || 0}`,
          `Total Collection,${summaryData?.total_collection || 0}`,
          `Total Expenses,${summaryData?.total_expense || 0}`,
          `Pending Customer Payments,${summaryData?.pending_payments || 0}`,
          `Pending Deliveries,${summaryData?.pending_deliveries || 0}`,
          `Total Batches Processed,${summaryData?.total_batches || 0}`,
          `Outsourced Processing KG,${summaryData?.outsourced_summary?.total_kg || 0}`,
          `Outsourced Balance Payable,${summaryData?.outsourced_summary?.balance_payable || 0}`,
        ].join("\n");
      }

      if (Platform.OS === "web") {
        const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.show(`${filename} downloaded successfully!`, "success");
      } else {
        const fileUri = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(fileUri, "\uFEFF" + csvContent, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: "text/csv",
            dialogTitle: `Share ${filename}`,
            UTI: "public.comma-separated-values-text",
          });
        } else {
          toast.show("File saved to device cache", "success");
        }
      }
    } catch (err: any) {
      toast.show(err.message || "Failed to export report", "error");
    } finally {
      setExporting(false);
    }
  };

  // Filtered lists by search term
  const filteredMachines = useMemo(() => {
    if (!q.trim()) return machinesData;
    const term = q.toLowerCase();
    return machinesData.filter(m =>
      m.machine_name.toLowerCase().includes(term) ||
      (m.vendor_name && m.vendor_name.toLowerCase().includes(term)) ||
      (m.branch_name && m.branch_name.toLowerCase().includes(term))
    );
  }, [machinesData, q]);

  const filteredInhouse = useMemo(() => {
    return filteredMachines.filter(m => !m.is_outsourced);
  }, [filteredMachines]);

  const filteredOutsourced = useMemo(() => {
    return filteredMachines.filter(m => m.is_outsourced);
  }, [filteredMachines]);

  const filteredCustomers = useMemo(() => {
    if (!q.trim()) return customersData;
    const term = q.toLowerCase();
    return customersData.filter(c =>
      c.customer_name.toLowerCase().includes(term) ||
      (c.customer_code && c.customer_code.toLowerCase().includes(term)) ||
      (c.customer_mobile && c.customer_mobile.includes(term))
    );
  }, [customersData, q]);

  const filteredPayments = useMemo(() => {
    if (!q.trim()) return paymentsData;
    const term = q.toLowerCase();
    return paymentsData.filter(p =>
      (p.customer_name && p.customer_name.toLowerCase().includes(term)) ||
      (p.customer_code && p.customer_code.toLowerCase().includes(term)) ||
      (p.batch_no && p.batch_no.toLowerCase().includes(term)) ||
      (p.mode && p.mode.toLowerCase().includes(term)) ||
      (p.remarks && p.remarks.toLowerCase().includes(term))
    );
  }, [paymentsData, q]);

  const filteredExpenses = useMemo(() => {
    if (!q.trim()) return expensesData;
    const term = q.toLowerCase();
    return expensesData.filter(e =>
      (e.category && e.category.toLowerCase().includes(term)) ||
      (e.vendor && e.vendor.toLowerCase().includes(term)) ||
      (e.remarks && e.remarks.toLowerCase().includes(term)) ||
      (e.machine_name && e.machine_name.toLowerCase().includes(term))
    );
  }, [expensesData, q]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {/* Top Header */}
      <View style={[styles.header, isTab && { paddingHorizontal: spacing.lg, justifyContent: "flex-start", gap: spacing.sm }]}>
        {!isTab && (
          <TouchableOpacity onPress={() => router.back()} testID="reports-back" style={{ marginRight: spacing.sm }}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Reports & Analytics</Text>
          <Text style={styles.subTitle}>{activeBranchName}</Text>
        </View>

        {/* Global Download / Export Button */}
        <TouchableOpacity
          style={styles.exportBtn}
          onPress={handleExportCSV}
          disabled={exporting}
          activeOpacity={0.8}
        >
          {exporting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialCommunityIcons name="file-excel-box" size={18} color="#fff" />
              <Text style={styles.exportBtnText}>Export CSV</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Horizontal Report Tabs Selector */}
      <View style={styles.tabsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          <TouchableOpacity
            style={[styles.tabPill, activeTab === "summary" && styles.tabPillActive]}
            onPress={() => handleTabChange("summary")}
          >
            <MaterialCommunityIcons name="chart-pie" size={16} color={activeTab === "summary" ? "#fff" : colors.textMuted} />
            <Text style={[styles.tabText, activeTab === "summary" && styles.tabTextActive]}>Overview</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabPill, activeTab === "machines" && styles.tabPillActive]}
            onPress={() => handleTabChange("machines")}
          >
            <MaterialCommunityIcons name="cog-outline" size={16} color={activeTab === "machines" ? "#fff" : colors.textMuted} />
            <Text style={[styles.tabText, activeTab === "machines" && styles.tabTextActive]}>Machines</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabPill, activeTab === "customers" && styles.tabPillActive]}
            onPress={() => handleTabChange("customers")}
          >
            <MaterialCommunityIcons name="account-group-outline" size={16} color={activeTab === "customers" ? "#fff" : colors.textMuted} />
            <Text style={[styles.tabText, activeTab === "customers" && styles.tabTextActive]}>Customers</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabPill, activeTab === "payments" && styles.tabPillActive]}
            onPress={() => handleTabChange("payments")}
          >
            <MaterialCommunityIcons name="cash-multiple" size={16} color={activeTab === "payments" ? "#fff" : colors.textMuted} />
            <Text style={[styles.tabText, activeTab === "payments" && styles.tabTextActive]}>Payments</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabPill, activeTab === "expenses" && styles.tabPillActive]}
            onPress={() => handleTabChange("expenses")}
          >
            <MaterialCommunityIcons name="receipt" size={16} color={activeTab === "expenses" ? "#fff" : colors.textMuted} />
            <Text style={[styles.tabText, activeTab === "expenses" && styles.tabTextActive]}>Expenses</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabPill, activeTab === "outsourced" && styles.tabPillActive]}
            onPress={() => handleTabChange("outsourced")}
          >
            <MaterialCommunityIcons name="truck-delivery-outline" size={16} color={activeTab === "outsourced" ? "#fff" : colors.textMuted} />
            <Text style={[styles.tabText, activeTab === "outsourced" && styles.tabTextActive]}>Outsourced & Payouts</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loaderText}>Loading Report Data...</Text>
        </View>
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadAll(); }}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={{ paddingBottom: 110 }}
        >
          {/* ==================== TAB 1: SUMMARY / OVERVIEW ==================== */}
          {activeTab === "summary" && summaryData && (
            <View style={{ gap: spacing.md, paddingHorizontal: spacing.md }}>
              {/* Overall Produce Summary Card: Wet Arrival, Processed, Delivered */}
              <View style={styles.produceHero}>
                <View style={styles.produceHeroHeader}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <MaterialCommunityIcons name="scale" size={18} color="#065F46" />
                    <Text style={styles.produceHeroTitle}>Plant Produce Operations</Text>
                  </View>
                  <Text style={styles.produceHeroSub}>{summaryData.total_batches || 0} Total Lots</Text>
                </View>

                <View style={styles.produceHeroGrid}>
                  <View style={styles.produceHeroCol}>
                    <Text style={styles.produceHeroLabel}>Wet Arrival</Text>
                    <Text style={styles.produceHeroVal}>
                      {Number(summaryData.total_wet_arrival || 0).toLocaleString("en-IN", { maximumFractionDigits: 1 })}
                      <Text style={styles.produceHeroUnit}> kg</Text>
                    </Text>
                    <Text style={styles.produceHeroSubText}>Raw Received</Text>
                  </View>

                  <View style={styles.produceHeroDivider} />

                  <View style={styles.produceHeroCol}>
                    <Text style={styles.produceHeroLabel}>Processed</Text>
                    <Text style={[styles.produceHeroVal, { color: colors.primary }]}>
                      {Number(summaryData.total_processed_dry || 0).toLocaleString("en-IN", { maximumFractionDigits: 1 })}
                      <Text style={styles.produceHeroUnit}> kg</Text>
                    </Text>
                    <Text style={styles.produceHeroSubText}>Dry Output</Text>
                  </View>

                  <View style={styles.produceHeroDivider} />

                  <View style={styles.produceHeroCol}>
                    <Text style={styles.produceHeroLabel}>Delivered</Text>
                    <Text style={[styles.produceHeroVal, { color: "#15803D" }]}>
                      {Number(summaryData.total_delivered_dry || 0).toLocaleString("en-IN", { maximumFractionDigits: 1 })}
                      <Text style={styles.produceHeroUnit}> kg</Text>
                    </Text>
                    <Text style={styles.produceHeroSubText}>Dispatched</Text>
                  </View>
                </View>
              </View>

              {/* Alert Metrics Grid */}
              <View style={styles.alertGrid}>
                <View style={[styles.alert, { backgroundColor: "#FEF2F2", borderColor: "#FCA5A5", borderWidth: 1 }]}>
                  <MaterialCommunityIcons name="clock-alert-outline" size={22} color="#DC2626" />
                  <Text style={styles.alertLabel}>Pending Payments</Text>
                  <Text style={[styles.alertValue, { color: "#DC2626" }]}>
                    ₹{Number(summaryData.pending_payments || 0).toLocaleString("en-IN")}
                  </Text>
                </View>
                <View style={[styles.alert, { backgroundColor: "#FFFBEB", borderColor: "#FCD34D", borderWidth: 1 }]}>
                  <MaterialCommunityIcons name="truck-delivery-outline" size={22} color="#D97706" />
                  <Text style={styles.alertLabel}>Pending Deliveries</Text>
                  <Text style={[styles.alertValue, { color: "#D97706" }]}>
                    {summaryData.pending_deliveries || 0} Lots
                  </Text>
                </View>
              </View>

              {/* Quick Jump Buttons to Other Reports */}
              <View style={styles.quickReportsGrid}>
                <TouchableOpacity style={styles.quickCard} onPress={() => handleTabChange("machines")}>
                  <View style={[styles.quickIconBox, { backgroundColor: "#E0F2FE" }]}>
                    <MaterialCommunityIcons name="cog" size={20} color="#0284C7" />
                  </View>
                  <Text style={styles.quickCardTitle}>Machine Report</Text>
                  <Text style={styles.quickCardSub}>17 Dryers · Yield & Batch Stats</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.quickCard} onPress={() => handleTabChange("customers")}>
                  <View style={[styles.quickIconBox, { backgroundColor: "#DCFCE7" }]}>
                    <MaterialCommunityIcons name="account-group" size={20} color="#16A34A" />
                  </View>
                  <Text style={styles.quickCardTitle}>Customer Report</Text>
                  <Text style={styles.quickCardSub}>Billed, Collected & Pending</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.quickCard} onPress={() => handleTabChange("payments")}>
                  <View style={[styles.quickIconBox, { backgroundColor: "#FEF3C7" }]}>
                    <MaterialCommunityIcons name="cash-register" size={20} color="#D97706" />
                  </View>
                  <Text style={styles.quickCardTitle}>Payment Ledger</Text>
                  <Text style={styles.quickCardSub}>Mode-wise Transaction History</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.quickCard} onPress={() => handleTabChange("outsourced")}>
                  <View style={[styles.quickIconBox, { backgroundColor: "#FFEDD5" }]}>
                    <MaterialCommunityIcons name="truck-fast" size={20} color="#EA580C" />
                  </View>
                  <Text style={styles.quickCardTitle}>Outsourced & Payouts</Text>
                  <Text style={styles.quickCardSub}>Vendor Settlements & Balances</Text>
                </TouchableOpacity>
              </View>

              {/* Machine Utilization */}
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Machine Utilization</Text>
                {(summaryData.machine_utilization || []).map((m: any) => (
                  <View key={m.name} style={styles.utilRow}>
                    <MaterialCommunityIcons name="cog" size={18} color={colors.primary} />
                    <Text style={styles.utilName}>{m.name}</Text>
                    <View style={styles.utilBar}>
                      <View style={[styles.utilFill, { width: `${Math.min(100, m.batches * 8)}%` }]} />
                    </View>
                    <Text style={styles.utilCount}>{m.batches} lots</Text>
                  </View>
                ))}
              </View>

              {/* Expense Breakdown */}
              {summaryData.expense_by_category && Object.keys(summaryData.expense_by_category).length > 0 && (
                <View style={styles.card}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
                    <Text style={styles.sectionTitle}>Expenses by Category</Text>
                    <TouchableOpacity onPress={() => handleTabChange("expenses")}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>View All →</Text>
                    </TouchableOpacity>
                  </View>
                  {Object.entries(summaryData.expense_by_category)
                    .sort(([, a]: any, [, b]: any) => b - a)
                    .map(([cat, amt]: any) => (
                      <View key={cat} style={styles.catRow}>
                        <Text style={styles.catName}>{cat}</Text>
                        <Text style={styles.catAmt}>₹{Number(amt).toLocaleString("en-IN")}</Text>
                      </View>
                    ))}
                </View>
              )}
            </View>
          )}

          {/* ==================== TAB 2: MACHINE REPORT (INHOUSE & OUTSOURCED) ==================== */}
          {activeTab === "machines" && (
            <View style={{ paddingHorizontal: spacing.md, gap: spacing.md }}>
              {/* Search Bar */}
              <View style={styles.searchBar}>
                <MaterialCommunityIcons name="magnify" size={18} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search machine name or vendor..."
                  placeholderTextColor={colors.textLight}
                  value={q}
                  onChangeText={setQ}
                />
                {q ? (
                  <TouchableOpacity onPress={() => setQ("")}>
                    <MaterialCommunityIcons name="close-circle" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Summary Stats Strip */}
              <View style={styles.metricStrip}>
                <View style={styles.metricStripCol}>
                  <Text style={styles.metricStripLabel}>Machines</Text>
                  <Text style={styles.metricStripVal}>{filteredMachines.length}</Text>
                </View>
                <View style={styles.metricStripDivider} />
                <View style={styles.metricStripCol}>
                  <Text style={styles.metricStripLabel}>Total Wet</Text>
                  <Text style={styles.metricStripVal}>
                    {filteredMachines.reduce((a, b) => a + Number(b.total_wet_weight || 0), 0).toLocaleString("en-IN", { maximumFractionDigits: 1 })} kg
                  </Text>
                </View>
                <View style={styles.metricStripDivider} />
                <View style={styles.metricStripCol}>
                  <Text style={styles.metricStripLabel}>Total Dry</Text>
                  <Text style={[styles.metricStripVal, { color: "#15803D" }]}>
                    {filteredMachines.reduce((a, b) => a + Number(b.total_dry_weight || 0), 0).toLocaleString("en-IN", { maximumFractionDigits: 1 })} kg
                  </Text>
                </View>
              </View>

              {/* In-House Section */}
              <Text style={styles.subHeaderLabel}>In-House Dryers ({filteredInhouse.length})</Text>
              {filteredInhouse.map(m => (
                <View key={m.machine_id} style={styles.dataCard}>
                  <View style={styles.dataCardHeader}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                      <MaterialCommunityIcons name="cog" size={18} color={colors.primary} />
                      <Text style={styles.dataCardTitle}>{m.machine_name}</Text>
                      <View style={styles.inhouseBadge}>
                        <Text style={styles.inhouseBadgeText}>In-House</Text>
                      </View>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: m.status === "Running" ? "#FEF3C7" : "#F3F4F6" }]}>
                      <Text style={{ fontSize: 10, fontWeight: "800", color: m.status === "Running" ? "#B45309" : "#374151" }}>
                        {m.status}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.dataGrid}>
                    <View style={styles.dataGridItem}>
                      <Text style={styles.dataGridLabel}>Batches</Text>
                      <Text style={styles.dataGridVal}>{m.total_batches} ({m.active_batches} active)</Text>
                    </View>
                    <View style={styles.dataGridItem}>
                      <Text style={styles.dataGridLabel}>Wet Loaded</Text>
                      <Text style={styles.dataGridVal}>{m.total_wet_weight} kg</Text>
                    </View>
                    <View style={styles.dataGridItem}>
                      <Text style={styles.dataGridLabel}>Dry Produced</Text>
                      <Text style={[styles.dataGridVal, { color: "#15803D" }]}>{m.total_dry_weight} kg</Text>
                    </View>
                    <View style={styles.dataGridItem}>
                      <Text style={styles.dataGridLabel}>Yield</Text>
                      <Text style={[styles.dataGridVal, { color: colors.accent }]}>{m.yield_pct}%</Text>
                    </View>
                  </View>
                </View>
              ))}

              {/* Outsourced Section */}
              {filteredOutsourced.length > 0 && (
                <>
                  <Text style={[styles.subHeaderLabel, { marginTop: spacing.md }]}>
                    Outsourced Vendor Dryers ({filteredOutsourced.length})
                  </Text>
                  {filteredOutsourced.map(m => (
                    <View key={m.machine_id} style={[styles.dataCard, { borderColor: "#FCD34D" }]}>
                      <View style={styles.dataCardHeader}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                          <MaterialCommunityIcons name="truck-delivery" size={18} color="#D97706" />
                          <Text style={styles.dataCardTitle}>{m.machine_name}</Text>
                          <View style={[styles.inhouseBadge, { backgroundColor: "#FEF3C7" }]}>
                            <Text style={[styles.inhouseBadgeText, { color: "#B45309" }]}>Outsourced</Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: colors.textMuted }}>
                          ₹{m.vendor_rate_per_kg}/kg
                        </Text>
                      </View>

                      <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                        Vendor: {m.vendor_name || "External"} • {m.vendor_phone || "No phone"}
                      </Text>

                      <View style={styles.dataGrid}>
                        <View style={styles.dataGridItem}>
                          <Text style={styles.dataGridLabel}>Processed</Text>
                          <Text style={styles.dataGridVal}>{m.total_wet_weight} kg</Text>
                        </View>
                        <View style={styles.dataGridItem}>
                          <Text style={styles.dataGridLabel}>Total Cost</Text>
                          <Text style={styles.dataGridVal}>₹{m.total_cost.toLocaleString("en-IN")}</Text>
                        </View>
                        <View style={styles.dataGridItem}>
                          <Text style={styles.dataGridLabel}>Paid</Text>
                          <Text style={[styles.dataGridVal, { color: "#15803D" }]}>₹{m.total_paid.toLocaleString("en-IN")}</Text>
                        </View>
                        <View style={styles.dataGridItem}>
                          <Text style={styles.dataGridLabel}>Balance</Text>
                          <Text style={[styles.dataGridVal, { color: m.balance_payable > 0 ? "#DC2626" : "#15803D" }]}>
                            ₹{m.balance_payable.toLocaleString("en-IN")}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </>
              )}
            </View>
          )}

          {/* ==================== TAB 3: CUSTOMER REPORT ==================== */}
          {activeTab === "customers" && (
            <View style={{ paddingHorizontal: spacing.md, gap: spacing.md }}>
              <View style={styles.searchBar}>
                <MaterialCommunityIcons name="magnify" size={18} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search customer name, code, phone..."
                  placeholderTextColor={colors.textLight}
                  value={q}
                  onChangeText={setQ}
                />
                {q ? (
                  <TouchableOpacity onPress={() => setQ("")}>
                    <MaterialCommunityIcons name="close-circle" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={styles.metricStrip}>
                <View style={styles.metricStripCol}>
                  <Text style={styles.metricStripLabel}>Customers</Text>
                  <Text style={styles.metricStripVal}>{filteredCustomers.length}</Text>
                </View>
                <View style={styles.metricStripDivider} />
                <View style={styles.metricStripCol}>
                  <Text style={styles.metricStripLabel}>Total Billed</Text>
                  <Text style={styles.metricStripVal}>
                    ₹{filteredCustomers.reduce((a, b) => a + Number(b.total_billed || 0), 0).toLocaleString("en-IN")}
                  </Text>
                </View>
                <View style={styles.metricStripDivider} />
                <View style={styles.metricStripCol}>
                  <Text style={styles.metricStripLabel}>Balance Due</Text>
                  <Text style={[styles.metricStripVal, { color: "#DC2626" }]}>
                    ₹{filteredCustomers.reduce((a, b) => a + Number(b.balance_amount || 0), 0).toLocaleString("en-IN")}
                  </Text>
                </View>
              </View>

              {filteredCustomers.map(c => (
                <View key={c.customer_id} style={styles.dataCard}>
                  <View style={styles.dataCardHeader}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={styles.dataCardTitle}>{c.customer_name}</Text>
                        {c.customer_code ? (
                          <View style={styles.codeTag}>
                            <Text style={styles.codeTagText}>{c.customer_code}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                        {c.customer_mobile || "No phone"} • {c.branch_name || "Main Plant"}
                      </Text>
                    </View>
                    <View style={styles.batchCountPill}>
                      <Text style={styles.batchCountPillText}>{c.total_batches} Lots</Text>
                    </View>
                  </View>

                  <View style={styles.dataGrid}>
                    <View style={styles.dataGridItem}>
                      <Text style={styles.dataGridLabel}>Arrival Wet</Text>
                      <Text style={styles.dataGridVal}>{c.total_wet_weight} kg</Text>
                    </View>
                    <View style={styles.dataGridItem}>
                      <Text style={styles.dataGridLabel}>Delivered Dry</Text>
                      <Text style={styles.dataGridVal}>{c.total_dry_weight} kg</Text>
                    </View>
                    <View style={styles.dataGridItem}>
                      <Text style={styles.dataGridLabel}>Avg Padi</Text>
                      <Text style={[styles.dataGridVal, { color: c.avg_padi_weight > 0 ? colors.accent : colors.textMuted }]}>
                        {c.avg_padi_weight > 0 ? `${c.avg_padi_weight} g` : "-"}
                      </Text>
                    </View>
                    <View style={styles.dataGridItem}>
                      <Text style={styles.dataGridLabel}>Total Billed</Text>
                      <Text style={styles.dataGridVal}>₹{Number(c.total_billed).toLocaleString("en-IN")}</Text>
                    </View>
                    <View style={styles.dataGridItem}>
                      <Text style={styles.dataGridLabel}>Total Paid</Text>
                      <Text style={[styles.dataGridVal, { color: "#15803D" }]}>₹{Number(c.total_paid).toLocaleString("en-IN")}</Text>
                    </View>
                    <View style={styles.dataGridItem}>
                      <Text style={styles.dataGridLabel}>Balance</Text>
                      <Text style={[styles.dataGridVal, { color: c.balance_amount > 0 ? "#DC2626" : "#15803D" }]}>
                        ₹{Number(c.balance_amount).toLocaleString("en-IN")}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* ==================== TAB 4: PAYMENTS REPORT ==================== */}
          {activeTab === "payments" && (
            <View style={{ paddingHorizontal: spacing.md, gap: spacing.md }}>
              <View style={styles.searchBar}>
                <MaterialCommunityIcons name="magnify" size={18} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search customer, batch, mode, remarks..."
                  placeholderTextColor={colors.textLight}
                  value={q}
                  onChangeText={setQ}
                />
                {q ? (
                  <TouchableOpacity onPress={() => setQ("")}>
                    <MaterialCommunityIcons name="close-circle" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={styles.metricStrip}>
                <View style={styles.metricStripCol}>
                  <Text style={styles.metricStripLabel}>Transactions</Text>
                  <Text style={styles.metricStripVal}>{filteredPayments.length}</Text>
                </View>
                <View style={styles.metricStripDivider} />
                <View style={styles.metricStripCol}>
                  <Text style={styles.metricStripLabel}>Total Received</Text>
                  <Text style={[styles.metricStripVal, { color: "#15803D" }]}>
                    ₹{filteredPayments.reduce((a, b) => a + Number(b.amount || 0), 0).toLocaleString("en-IN")}
                  </Text>
                </View>
              </View>

              {filteredPayments.map(p => (
                <View key={p.id} style={styles.dataCard}>
                  <View style={styles.dataCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dataCardTitle}>{p.customer_name || "Customer"}</Text>
                      <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                        {fmtDate(p.created_at)} • Receipt #{p.id.slice(0, 8).toUpperCase()}
                        {p.batch_no ? ` • Batch ${p.batch_no}` : ""}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ fontSize: 15, fontWeight: "800", color: "#15803D" }}>
                        ₹{Number(p.amount).toLocaleString("en-IN")}
                      </Text>
                      <View style={styles.modeBadge}>
                        <Text style={styles.modeBadgeText}>{p.mode || "Cash"}</Text>
                      </View>
                    </View>
                  </View>
                  {p.remarks ? (
                    <Text style={{ fontSize: 11, color: colors.textMuted, fontStyle: "italic", marginTop: 4 }}>
                      "{p.remarks}"
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}

          {/* ==================== TAB 5: EXPENSES REPORT ==================== */}
          {activeTab === "expenses" && (
            <View style={{ paddingHorizontal: spacing.md, gap: spacing.md }}>
              <View style={styles.searchBar}>
                <MaterialCommunityIcons name="magnify" size={18} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search category, vendor, machine..."
                  placeholderTextColor={colors.textLight}
                  value={q}
                  onChangeText={setQ}
                />
                {q ? (
                  <TouchableOpacity onPress={() => setQ("")}>
                    <MaterialCommunityIcons name="close-circle" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={styles.metricStrip}>
                <View style={styles.metricStripCol}>
                  <Text style={styles.metricStripLabel}>Expenses</Text>
                  <Text style={styles.metricStripVal}>{filteredExpenses.length}</Text>
                </View>
                <View style={styles.metricStripDivider} />
                <View style={styles.metricStripCol}>
                  <Text style={styles.metricStripLabel}>Total Spent</Text>
                  <Text style={[styles.metricStripVal, { color: "#DC2626" }]}>
                    ₹{filteredExpenses.reduce((a, b) => a + Number(b.amount || 0), 0).toLocaleString("en-IN")}
                  </Text>
                </View>
              </View>

              {filteredExpenses.map(e => (
                <View key={e.id} style={styles.dataCard}>
                  <View style={styles.dataCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dataCardTitle}>{e.category || "General"}</Text>
                      <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                        {e.expense_date || "-"}
                        {e.vendor ? ` • Payee: ${e.vendor}` : ""}
                        {e.machine_name ? ` • Machine: ${e.machine_name}` : ""}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ fontSize: 15, fontWeight: "800", color: "#DC2626" }}>
                        ₹{Number(e.amount).toLocaleString("en-IN")}
                      </Text>
                      {e.payment_mode ? (
                        <View style={styles.modeBadge}>
                          <Text style={styles.modeBadgeText}>{e.payment_mode}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  {e.remarks ? (
                    <Text style={{ fontSize: 11, color: colors.textMuted, fontStyle: "italic", marginTop: 4 }}>
                      "{e.remarks}"
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}

          {/* ==================== TAB 6: OUTSOURCED & PAYOUTS ==================== */}
          {activeTab === "outsourced" && (
            <View style={{ paddingHorizontal: spacing.md, gap: spacing.md }}>
              <View style={styles.searchBar}>
                <MaterialCommunityIcons name="magnify" size={18} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search vendor or machine..."
                  placeholderTextColor={colors.textLight}
                  value={q}
                  onChangeText={setQ}
                />
                {q ? (
                  <TouchableOpacity onPress={() => setQ("")}>
                    <MaterialCommunityIcons name="close-circle" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Outsourced Summary Overview Strip */}
              <View style={[styles.metricStrip, { backgroundColor: "#FFFBEB", borderColor: "#FCD34D" }]}>
                <View style={styles.metricStripCol}>
                  <Text style={styles.metricStripLabel}>Total Processed</Text>
                  <Text style={[styles.metricStripVal, { color: "#D97706" }]}>
                    {filteredOutsourced.reduce((a, b) => a + Number(b.total_wet_weight || 0), 0).toLocaleString("en-IN")} kg
                  </Text>
                </View>
                <View style={styles.metricStripDivider} />
                <View style={styles.metricStripCol}>
                  <Text style={styles.metricStripLabel}>Total Cost</Text>
                  <Text style={styles.metricStripVal}>
                    ₹{filteredOutsourced.reduce((a, b) => a + Number(b.total_cost || 0), 0).toLocaleString("en-IN")}
                  </Text>
                </View>
                <View style={styles.metricStripDivider} />
                <View style={styles.metricStripCol}>
                  <Text style={styles.metricStripLabel}>Pending Payout</Text>
                  <Text style={[styles.metricStripVal, { color: "#DC2626" }]}>
                    ₹{filteredOutsourced.reduce((a, b) => a + Number(b.balance_payable || 0), 0).toLocaleString("en-IN")}
                  </Text>
                </View>
              </View>

              {filteredOutsourced.length === 0 ? (
                <View style={styles.empty}>
                  <MaterialCommunityIcons name="truck-outline" size={44} color={colors.textLight} />
                  <Text style={styles.emptyText}>No outsourced dryers configured</Text>
                </View>
              ) : (
                filteredOutsourced.map(m => (
                  <View key={m.machine_id} style={[styles.dataCard, { borderColor: "#FCD34D" }]}>
                    <View style={styles.dataCardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.dataCardTitle}>{m.machine_name}</Text>
                        <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                          Vendor: {m.vendor_name || "External"} • {m.vendor_phone || "No phone"}
                        </Text>
                      </View>
                      <View style={styles.batchCountPill}>
                        <Text style={styles.batchCountPillText}>{m.total_batches} Batches</Text>
                      </View>
                    </View>

                    <View style={styles.dataGrid}>
                      <View style={styles.dataGridItem}>
                        <Text style={styles.dataGridLabel}>Agreed Rate</Text>
                        <Text style={styles.dataGridVal}>₹{m.vendor_rate_per_kg}/kg</Text>
                      </View>
                      <View style={styles.dataGridItem}>
                        <Text style={styles.dataGridLabel}>Processed Wet</Text>
                        <Text style={styles.dataGridVal}>{m.total_wet_weight} kg</Text>
                      </View>
                      <View style={styles.dataGridItem}>
                        <Text style={styles.dataGridLabel}>Total Cost</Text>
                        <Text style={styles.dataGridVal}>₹{m.total_cost.toLocaleString("en-IN")}</Text>
                      </View>
                      <View style={styles.dataGridItem}>
                        <Text style={styles.dataGridLabel}>Paid Settlement</Text>
                        <Text style={[styles.dataGridVal, { color: "#15803D" }]}>₹{m.total_paid.toLocaleString("en-IN")}</Text>
                      </View>
                      <View style={styles.dataGridItem}>
                        <Text style={styles.dataGridLabel}>Balance Payable</Text>
                        <Text style={[styles.dataGridVal, { color: m.balance_payable > 0 ? "#DC2626" : "#15803D" }]}>
                          ₹{m.balance_payable.toLocaleString("en-IN")}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  title: { fontSize: 19, fontWeight: "800", color: colors.text },
  subTitle: { fontSize: 11, color: colors.textMuted, marginTop: 1 },

  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#16A34A",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    ...shadow.sm,
  },
  exportBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },

  tabsWrap: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 6,
    marginBottom: spacing.sm,
  },
  tabsScroll: { paddingHorizontal: spacing.md, gap: 6 },
  tabPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabText: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  tabTextActive: { color: "#fff" },

  loaderWrap: { paddingTop: 80, alignItems: "center", justifyContent: "center" },
  loaderText: { fontSize: 14, color: colors.textMuted, marginTop: 10, fontWeight: "600" },

  produceHero: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: "#A7F3D0",
    ...shadow.card,
  },
  produceHeroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  produceHeroTitle: { fontSize: 13, fontWeight: "800", color: "#065F46" },
  produceHeroSub: { fontSize: 11, fontWeight: "700", color: colors.textMuted },
  produceHeroGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 2,
  },
  produceHeroCol: { flex: 1, alignItems: "center" },
  produceHeroLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted },
  produceHeroVal: { fontSize: 16, fontWeight: "800", color: colors.text, marginTop: 3 },
  produceHeroUnit: { fontSize: 11, fontWeight: "600", color: colors.textMuted },
  produceHeroSubText: { fontSize: 10, color: colors.textLight, marginTop: 2 },
  produceHeroDivider: { width: 1, height: 36, backgroundColor: colors.border },

  alertGrid: { flexDirection: "row", gap: spacing.md },
  alert: { flex: 1, padding: spacing.md, borderRadius: radius.lg, gap: 4 },
  alertLabel: { fontSize: 11, color: colors.textMuted, fontWeight: "700" },
  alertValue: { fontSize: 16, fontWeight: "800" },

  quickReportsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  quickCard: {
    width: "48.5%",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  quickIconBox: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  quickCardTitle: { fontSize: 13, fontWeight: "800", color: colors.text },
  quickCardSub: { fontSize: 10.5, color: colors.textMuted, marginTop: 2 },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: colors.text, marginBottom: spacing.sm },

  utilRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, gap: spacing.sm },
  utilName: { width: 85, fontSize: 12, color: colors.text, fontWeight: "700" },
  utilBar: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: "hidden" },
  utilFill: { height: "100%", backgroundColor: colors.primary },
  utilCount: { fontSize: 11.5, fontWeight: "800", color: colors.text, width: 45, textAlign: "right" },

  catRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.border },
  catName: { fontSize: 12.5, color: colors.text, fontWeight: "600" },
  catAmt: { fontSize: 12.5, color: colors.accent, fontWeight: "800" },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, paddingVertical: 8, fontSize: 13, color: colors.text },

  metricStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: colors.card,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricStripCol: { alignItems: "center" },
  metricStripLabel: { fontSize: 10, color: colors.textMuted, fontWeight: "700" },
  metricStripVal: { fontSize: 13.5, fontWeight: "800", color: colors.text, marginTop: 1 },
  metricStripDivider: { width: 1, height: 22, backgroundColor: colors.border },

  subHeaderLabel: { fontSize: 13, fontWeight: "800", color: colors.textMuted, paddingLeft: 2 },

  dataCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
    gap: 8,
  },
  dataCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dataCardTitle: { fontSize: 14, fontWeight: "800", color: colors.text },
  inhouseBadge: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: radius.pill,
  },
  inhouseBadgeText: { fontSize: 9.5, fontWeight: "800", color: "#16A34A" },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill },

  codeTag: {
    backgroundColor: colors.accent + "20",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  codeTagText: { fontSize: 9.5, fontWeight: "800", color: colors.accent },

  batchCountPill: {
    backgroundColor: colors.primary50,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  batchCountPillText: { fontSize: 10.5, fontWeight: "800", color: colors.primary },

  modeBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
    marginTop: 2,
  },
  modeBadgeText: { fontSize: 10, fontWeight: "700", color: "#374151" },

  dataGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#F9FAFB",
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  dataGridItem: { width: "32%", paddingVertical: 3 },
  dataGridLabel: { fontSize: 9.5, color: colors.textMuted, fontWeight: "600" },
  dataGridVal: { fontSize: 11.5, fontWeight: "800", color: colors.text, marginTop: 1 },

  empty: { alignItems: "center", paddingVertical: 40, gap: 6 },
  emptyText: { fontSize: 13, color: colors.textMuted, fontWeight: "600" },
});
