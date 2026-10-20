import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import Calendar from "@/src/components/Calendar";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";

const MODE_COLORS: Record<string, string> = {
  Cash: "#43A047",
  UPI: "#7B1FA2",
  Bank: "#1565C0",
  Credit: "#F57C00",
};

const MODES = ["Cash", "UPI", "Bank", "Credit"];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartISO() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso ? iso.slice(0, 10) : "-";
  }
}

function fmtMonth(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso ? iso.slice(0, 7) : "-";
  }
}

const DATE_PRESETS = [
  { key: "all", label: "All" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "month", label: "This Month" },
  { key: "fy_25_26", label: "25-26" },
  { key: "fy_26_27", label: "26-27" },
];

type ViewMode = "cashbook" | "date" | "month" | "customer";

export default function PaymentsScreen() {
  const router = useRouter();
  const { user, selectedBranchId } = useAuth();
  const toast = useToast();
  const isAdminOrManager = user?.role === "Admin" || user?.role === "Manager";

  const [paymentsList, setPaymentsList] = useState<any[]>([]);
  const [expensesList, setExpensesList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftStart, setDraftStart] = useState<string>("");
  const [draftEnd, setDraftEnd] = useState<string>("");
  const [activePreset, setActivePreset] = useState("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("cashbook");

  // Accordion expansion state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Edit Payment State
  const [editingPayment, setEditingPayment] = useState<any | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editMode, setEditMode] = useState("Cash");
  const [editDate, setEditDate] = useState("");
  const [editRemarks, setEditRemarks] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const applyPreset = (key: string) => {
    setActivePreset(key);
    const today = new Date();
    let s = "";
    let e = "";

    if (key === "today") {
      s = todayISO();
      e = todayISO();
    } else if (key === "yesterday") {
      const d = new Date();
      d.setDate(today.getDate() - 1);
      s = d.toISOString().slice(0, 10);
      e = s;
    } else if (key === "month") {
      s = monthStartISO();
      e = todayISO();
    } else if (key === "fy_25_26") {
      s = "2025-04-01";
      e = "2026-03-31";
    } else if (key === "fy_26_27") {
      s = "2026-04-01";
      e = "2027-03-31";
    }

    setStartDate(s);
    setEndDate(e);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = [];
      if (selectedBranchId) params.push(`branch_id=${selectedBranchId}`);
      if (startDate) params.push(`start=${startDate}`);
      if (endDate) params.push(`end=${endDate}`);
      const qs = params.length ? `?${params.join("&")}` : "";

      const [pRes, eRes] = await Promise.all([
        api<any[]>(`/payments${qs}`),
        api<any[]>(`/expenses${qs}`).catch(() => []),
      ]);

      pRes.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      eRes.sort((a, b) => new Date(b.expense_date || b.created_at).getTime() - new Date(a.expense_date || a.created_at).getTime());

      setPaymentsList(pRes);
      setExpensesList(eRes);
    } catch (err: any) {
      toast.show(err.message || "Failed to load ledger data", "error");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedBranchId, toast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Filtered Payments
  const filteredPayments = useMemo(() => {
    if (!searchQuery) return paymentsList;
    const q = searchQuery.toLowerCase().trim();
    return paymentsList.filter(item => {
      const name = (item.customer_name || "").toLowerCase();
      const code = (item.customer_code || "").toLowerCase();
      const mob = (item.customer_mobile || "").toLowerCase();
      const batch = (item.batch_no || "").toLowerCase();
      const rem = (item.remarks || "").toLowerCase();
      return name.includes(q) || code.includes(q) || mob.includes(q) || batch.includes(q) || rem.includes(q);
    });
  }, [paymentsList, searchQuery]);

  // Filtered Expenses (for Cash Book)
  const filteredExpenses = useMemo(() => {
    if (!searchQuery) return expensesList;
    const q = searchQuery.toLowerCase().trim();
    return expensesList.filter(item => {
      const cat = (item.category || "").toLowerCase();
      const desc = (item.description || item.notes || "").toLowerCase();
      return cat.includes(q) || desc.includes(q);
    });
  }, [expensesList, searchQuery]);

  // Totals for Payments
  const paymentTotals = useMemo(() => {
    let total = 0;
    const byMode: Record<string, number> = { Cash: 0, UPI: 0, Bank: 0, Credit: 0 };
    for (const p of filteredPayments) {
      const amt = Number(p.amount) || 0;
      total += amt;
      const m = p.mode || "Cash";
      byMode[m] = (byMode[m] || 0) + amt;
    }
    return { total, byMode };
  }, [filteredPayments]);

  // Totals for Expenses
  const expenseTotals = useMemo(() => {
    let total = 0;
    for (const e of filteredExpenses) {
      total += Number(e.amount) || 0;
    }
    return { total };
  }, [filteredExpenses]);

  // Cash Book Unified Daybook (Inflows vs Outflows)
  const cashBookDays = useMemo(() => {
    const dayMap = new Map<string, { date: string; displayDate: string; inflows: any[]; outflows: any[]; totalIn: number; totalOut: number }>();

    // Add Inflows (Payments received)
    for (const p of filteredPayments) {
      const dKey = (p.created_at || "").slice(0, 10) || "Unknown";
      if (!dayMap.has(dKey)) {
        dayMap.set(dKey, {
          date: dKey,
          displayDate: fmtDate(p.created_at),
          inflows: [],
          outflows: [],
          totalIn: 0,
          totalOut: 0,
        });
      }
      const entry = dayMap.get(dKey)!;
      entry.inflows.push(p);
      entry.totalIn += Number(p.amount) || 0;
    }

    // Add Outflows (Expenses paid)
    for (const e of filteredExpenses) {
      const dKey = (e.expense_date || e.created_at || "").slice(0, 10) || "Unknown";
      if (!dayMap.has(dKey)) {
        dayMap.set(dKey, {
          date: dKey,
          displayDate: fmtDate(e.expense_date || e.created_at),
          inflows: [],
          outflows: [],
          totalIn: 0,
          totalOut: 0,
        });
      }
      const entry = dayMap.get(dKey)!;
      entry.outflows.push(e);
      entry.totalOut += Number(e.amount) || 0;
    }

    return Array.from(dayMap.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredPayments, filteredExpenses]);

  // Date-wise Payments
  const groupedByDate = useMemo(() => {
    const map = new Map<string, { date: string; displayDate: string; items: any[]; total: number }>();
    for (const item of filteredPayments) {
      const dKey = (item.created_at || "").slice(0, 10) || "Unknown";
      if (!map.has(dKey)) {
        map.set(dKey, {
          date: dKey,
          displayDate: fmtDate(item.created_at),
          items: [],
          total: 0,
        });
      }
      const entry = map.get(dKey)!;
      entry.items.push(item);
      entry.total += Number(item.amount) || 0;
    }
    return Array.from(map.values());
  }, [filteredPayments]);

  // Month-wise Payments
  const groupedByMonth = useMemo(() => {
    const map = new Map<string, { monthKey: string; displayMonth: string; items: any[]; total: number; byMode: Record<string, number> }>();
    for (const item of filteredPayments) {
      const mKey = (item.created_at || "").slice(0, 7) || "Unknown";
      if (!map.has(mKey)) {
        map.set(mKey, {
          monthKey: mKey,
          displayMonth: fmtMonth(item.created_at),
          items: [],
          total: 0,
          byMode: { Cash: 0, UPI: 0, Bank: 0, Credit: 0 },
        });
      }
      const entry = map.get(mKey)!;
      entry.items.push(item);
      const amt = Number(item.amount) || 0;
      entry.total += amt;
      const m = item.mode || "Cash";
      entry.byMode[m] = (entry.byMode[m] || 0) + amt;
    }
    return Array.from(map.values());
  }, [filteredPayments]);

  // Customer-wise Ledger
  const groupedByCustomer = useMemo(() => {
    const map = new Map<string, { customerId: string; name: string; code: string; mobile: string; items: any[]; total: number }>();
    for (const item of filteredPayments) {
      const cId = item.customer_id || item.customer_name || "Unknown";
      if (!map.has(cId)) {
        map.set(cId, {
          customerId: item.customer_id || "",
          name: item.customer_name || "Customer",
          code: item.customer_code || "",
          mobile: item.customer_mobile || "",
          items: [],
          total: 0,
        });
      }
      const entry = map.get(cId)!;
      entry.items.push(item);
      entry.total += Number(item.amount) || 0;
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredPayments]);

  // Open Edit Modal
  const openEdit = (payment: any) => {
    setEditingPayment(payment);
    setEditAmount(String(payment.amount));
    setEditMode(payment.mode || "Cash");
    setEditDate((payment.created_at || "").slice(0, 10));
    setEditRemarks(payment.remarks || "");
  };

  // Submit Edit
  const handleSaveEdit = async () => {
    if (!editingPayment) return;
    const a = parseFloat(editAmount);
    if (isNaN(a) || a <= 0) {
      toast.show("Please enter a valid amount greater than 0", "error");
      return;
    }
    setSavingEdit(true);
    try {
      await api(`/payments/${editingPayment.id}`, {
        method: "PUT",
        body: {
          amount: a,
          mode: editMode,
          remarks: editRemarks,
          created_at: editDate ? `${editDate}T12:00:00Z` : undefined,
        },
      });
      toast.show("Payment updated successfully");
      setEditingPayment(null);
      load();
    } catch (e: any) {
      toast.show(e.message || "Failed to update payment", "error");
    } finally {
      setSavingEdit(false);
    }
  };

  // Delete Payment
  const handleDeletePayment = () => {
    if (!editingPayment) return;
    Alert.alert(
      "Delete Payment",
      `Are you sure you want to delete this payment of ₹${editingPayment.amount}? Batch totals will be automatically recalculated.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setSavingEdit(true);
            try {
              await api(`/payments/${editingPayment.id}`, { method: "DELETE" });
              toast.show("Payment deleted");
              setEditingPayment(null);
              load();
            } catch (e: any) {
              toast.show(e.message || "Failed to delete payment", "error");
            } finally {
              setSavingEdit(false);
            }
          },
        },
      ]
    );
  };

  // Render Payment Card
  const renderPaymentCard = (item: any) => (
    <View key={item.id} style={styles.item}>
      <View style={[styles.icon, { backgroundColor: `${MODE_COLORS[item.mode] || colors.primary}20` }]}>
        <MaterialCommunityIcons name="cash" size={20} color={MODE_COLORS[item.mode] || colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={styles.amount}>₹{Number(item.amount).toFixed(2)}</Text>
            <View style={[styles.modeChip, { backgroundColor: `${MODE_COLORS[item.mode] || colors.primary}20` }]}>
              <Text style={[styles.modeText, { color: MODE_COLORS[item.mode] || colors.primary }]}>{item.mode}</Text>
            </View>
          </View>
          {item.branch_name ? (
            <View style={styles.branchBadge}>
              <Text style={styles.branchBadgeText}>{item.branch_name}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.meta}>
          {item.customer_name || "-"} {item.customer_code ? `(${item.customer_code})` : ""} · {item.batch_no}
        </Text>
        {item.remarks ? (
          <Text style={styles.remarksText} numberOfLines={1}>
            📝 {item.remarks}
          </Text>
        ) : null}
        <Text style={styles.date}>
          {new Date(item.created_at).toLocaleString("en-IN", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>

      {isAdminOrManager && (
        <TouchableOpacity
          onPress={() => openEdit(item)}
          style={styles.editActionBtn}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.primary} />
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Cash Book & Ledgers</Text>
          <Text style={styles.subTitle}>Cross-check with physical ledger & cash drawer</Text>
        </View>
        <TouchableOpacity
          style={styles.addPaymentBtn}
          onPress={() => router.push("/payment-form")}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="plus" size={18} color="#fff" />
          <Text style={styles.addPaymentBtnText}>+ Add Payment</Text>
        </TouchableOpacity>
      </View>

      {/* 4 View Tabs */}
      <View style={styles.viewModeTabs}>
        <TouchableOpacity
          style={[styles.viewTab, viewMode === "cashbook" && styles.viewTabActive]}
          onPress={() => setViewMode("cashbook")}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="book-open-page-variant"
            size={15}
            color={viewMode === "cashbook" ? "#fff" : colors.textMuted}
          />
          <Text style={[styles.viewTabText, viewMode === "cashbook" && styles.viewTabTextActive]}>
            Cash Book
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.viewTab, viewMode === "date" && styles.viewTabActive]}
          onPress={() => setViewMode("date")}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="calendar"
            size={15}
            color={viewMode === "date" ? "#fff" : colors.textMuted}
          />
          <Text style={[styles.viewTabText, viewMode === "date" && styles.viewTabTextActive]}>
            Date-wise
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.viewTab, viewMode === "month" && styles.viewTabActive]}
          onPress={() => setViewMode("month")}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="chart-timeline-variant"
            size={15}
            color={viewMode === "month" ? "#fff" : colors.textMuted}
          />
          <Text style={[styles.viewTabText, viewMode === "month" && styles.viewTabTextActive]}>
            Month-wise
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.viewTab, viewMode === "customer" && styles.viewTabActive]}
          onPress={() => setViewMode("customer")}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="account-group"
            size={15}
            color={viewMode === "customer" ? "#fff" : colors.textMuted}
          />
          <Text style={[styles.viewTabText, viewMode === "customer" && styles.viewTabTextActive]}>
            Customer Khata
          </Text>
        </TouchableOpacity>
      </View>

      {/* Date Presets Ribbon */}
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
              setDraftStart(startDate);
              setDraftEnd(endDate);
              setPickerOpen(true);
            }}
            style={[styles.datePill, activePreset === "custom" && styles.datePillActive]}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons
              name="calendar-range"
              size={13}
              color={activePreset === "custom" ? "#fff" : colors.textMuted}
              style={{ marginRight: 3 }}
            />
            <Text style={[styles.datePillText, activePreset === "custom" && styles.datePillTextActive]}>
              {startDate && endDate ? `${startDate} to ${endDate}` : "Custom"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Search Bar */}
      <View style={styles.searchWrap}>
        <MaterialCommunityIcons name="magnify" size={20} color={colors.textMuted} />
        <TextInput
          testID="payments-search-input"
          style={styles.searchInput}
          placeholder="Search customer, batch, remarks, expense category..."
          placeholderTextColor={colors.textLight}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <MaterialCommunityIcons name="close-circle" size={18} color={colors.textLight} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Reconciliation / Ledger Hero Card */}
      {viewMode === "cashbook" ? (
        <View style={styles.cashBookSummaryCard}>
          <View style={styles.cashBookRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cashBookLabel}>Cash In (Receipts)</Text>
              <Text style={[styles.cashBookVal, { color: "#4CAF50" }]}>
                +₹{paymentTotals.total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </Text>
              <Text style={styles.cashBookSub}>{filteredPayments.length} customer collections</Text>
            </View>
            <View style={{ width: 1, backgroundColor: colors.border, marginHorizontal: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cashBookLabel}>Cash Out (Expenses)</Text>
              <Text style={[styles.cashBookVal, { color: "#F44336" }]}>
                -₹{expenseTotals.total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </Text>
              <Text style={styles.cashBookSub}>{filteredExpenses.length} factory vouchers</Text>
            </View>
          </View>

          {/* Net Flow & Cash Box Reconciliation */}
          <View style={styles.netCashRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.netCashLabel}>Net Cash Flow</Text>
              <Text style={[styles.netCashVal, { color: (paymentTotals.total - expenseTotals.total) >= 0 ? colors.primary : "#D32F2F" }]}>
                ₹{(paymentTotals.total - expenseTotals.total).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </Text>
            </View>
            <View style={styles.cashInHandBox}>
              <Text style={styles.cashInHandLabel}>💵 Physical Cash In Drawer</Text>
              <Text style={styles.cashInHandVal}>
                ₹{(paymentTotals.byMode["Cash"] || 0).toLocaleString("en-IN")}
              </Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.totalCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.totalLabel}>Total Collections (Customer Payments)</Text>
            <Text style={styles.totalValue}>₹{paymentTotals.total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
              <Text style={styles.totalSub}>{filteredPayments.length} transactions</Text>
              {startDate && endDate ? (
                <Text style={styles.totalDateRange}>({startDate} - {endDate})</Text>
              ) : null}
            </View>

            {/* Reconciliation Breakdown */}
            <View style={styles.reconcileRow}>
              <View style={styles.reconcileChip}>
                <Text style={styles.reconcileChipLabel}>💵 Cash</Text>
                <Text style={styles.reconcileChipVal}>₹{(paymentTotals.byMode["Cash"] || 0).toLocaleString("en-IN")}</Text>
              </View>
              <View style={styles.reconcileChip}>
                <Text style={styles.reconcileChipLabel}>📱 UPI</Text>
                <Text style={styles.reconcileChipVal}>₹{(paymentTotals.byMode["UPI"] || 0).toLocaleString("en-IN")}</Text>
              </View>
              <View style={styles.reconcileChip}>
                <Text style={styles.reconcileChipLabel}>🏦 Bank</Text>
                <Text style={styles.reconcileChipVal}>₹{(paymentTotals.byMode["Bank"] || 0).toLocaleString("en-IN")}</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Main List */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.scrollList} showsVerticalScrollIndicator={false}>
          {/* 1. CASH BOOK (DAYBOOK DUAL FLOW) */}
          {viewMode === "cashbook" && (
            cashBookDays.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons name="book-open-outline" size={44} color={colors.textLight} />
                <Text style={styles.empty}>No Cash Book transactions for this period</Text>
              </View>
            ) : (
              cashBookDays.map(day => {
                const isCollapsed = expandedSections[day.date] === true;
                const netDay = day.totalIn - day.totalOut;
                return (
                  <View key={day.date} style={styles.groupCard}>
                    <TouchableOpacity
                      style={styles.groupHeader}
                      onPress={() => toggleSection(day.date)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.groupTitle}>{day.displayDate}</Text>
                        <Text style={styles.groupSub}>
                          {day.inflows.length} Receipts (+₹{day.totalIn.toLocaleString("en-IN")}) · {day.outflows.length} Expenses (-₹{day.totalOut.toLocaleString("en-IN")})
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={[styles.groupTotal, { color: netDay >= 0 ? "#2E7D32" : "#D32F2F" }]}>
                          Net: ₹{netDay.toLocaleString("en-IN")}
                        </Text>
                        <MaterialCommunityIcons
                          name={isCollapsed ? "chevron-down" : "chevron-up"}
                          size={20}
                          color={colors.textMuted}
                        />
                      </View>
                    </TouchableOpacity>

                    {!isCollapsed && (
                      <View style={styles.groupItemsContainer}>
                        {/* Receipts */}
                        {day.inflows.map(item => (
                          <View key={`in-${item.id}`} style={[styles.item, { borderLeftWidth: 3, borderLeftColor: "#4CAF50" }]}>
                            <View style={[styles.icon, { backgroundColor: "#E8F5E9" }]}>
                              <MaterialCommunityIcons name="arrow-down-left" size={20} color="#2E7D32" />
                            </View>
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                                <Text style={[styles.amount, { color: "#2E7D32" }]}>+₹{Number(item.amount).toFixed(2)}</Text>
                                <View style={[styles.modeChip, { backgroundColor: `${MODE_COLORS[item.mode] || colors.primary}20` }]}>
                                  <Text style={[styles.modeText, { color: MODE_COLORS[item.mode] || colors.primary }]}>{item.mode}</Text>
                                </View>
                              </View>
                              <Text style={styles.meta}>Receipt: {item.customer_name} ({item.batch_no})</Text>
                              {item.remarks ? <Text style={styles.remarksText} numberOfLines={1}>📝 {item.remarks}</Text> : null}
                            </View>
                            {isAdminOrManager && (
                              <TouchableOpacity onPress={() => openEdit(item)} style={styles.editActionBtn}>
                                <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.primary} />
                              </TouchableOpacity>
                            )}
                          </View>
                        ))}

                        {/* Expenses */}
                        {day.outflows.map(item => (
                          <View key={`out-${item.id}`} style={[styles.item, { borderLeftWidth: 3, borderLeftColor: "#F44336" }]}>
                            <View style={[styles.icon, { backgroundColor: "#FFEBEE" }]}>
                              <MaterialCommunityIcons name="arrow-up-right" size={20} color="#D32F2F" />
                            </View>
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                                <Text style={[styles.amount, { color: "#D32F2F" }]}>-₹{Number(item.amount).toFixed(2)}</Text>
                                <View style={[styles.modeChip, { backgroundColor: "#FFEBEE" }]}>
                                  <Text style={[styles.modeText, { color: "#D32F2F" }]}>{item.category || "Expense"}</Text>
                                </View>
                              </View>
                              <Text style={styles.meta}>{item.description || item.notes || "Factory Expense"}</Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })
            )
          )}

          {/* 2. DATE-WISE VIEW */}
          {viewMode === "date" && (
            groupedByDate.map(group => {
              const isCollapsed = expandedSections[group.date] === true;
              return (
                <View key={group.date} style={styles.groupCard}>
                  <TouchableOpacity
                    style={styles.groupHeader}
                    onPress={() => toggleSection(group.date)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.groupTitle}>{group.displayDate}</Text>
                      <Text style={styles.groupSub}>
                        {group.items.length} {group.items.length === 1 ? "payment" : "payments"}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={styles.groupTotal}>₹{group.total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</Text>
                      <MaterialCommunityIcons
                        name={isCollapsed ? "chevron-down" : "chevron-up"}
                        size={20}
                        color={colors.textMuted}
                      />
                    </View>
                  </TouchableOpacity>

                  {!isCollapsed && (
                    <View style={styles.groupItemsContainer}>
                      {group.items.map(item => renderPaymentCard(item))}
                    </View>
                  )}
                </View>
              );
            })
          )}

          {/* 3. MONTH-WISE VIEW */}
          {viewMode === "month" && (
            groupedByMonth.map(group => {
              const isCollapsed = expandedSections[group.monthKey] === true;
              return (
                <View key={group.monthKey} style={styles.groupCard}>
                  <TouchableOpacity
                    style={styles.groupHeader}
                    onPress={() => toggleSection(group.monthKey)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.groupTitle}>{group.displayMonth}</Text>
                      <Text style={styles.groupSub}>
                        {group.items.length} collections · Cash ₹{(group.byMode["Cash"] || 0).toLocaleString("en-IN")} · UPI ₹{(group.byMode["UPI"] || 0).toLocaleString("en-IN")}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={styles.groupTotal}>₹{group.total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</Text>
                      <MaterialCommunityIcons
                        name={isCollapsed ? "chevron-down" : "chevron-up"}
                        size={20}
                        color={colors.textMuted}
                      />
                    </View>
                  </TouchableOpacity>

                  {!isCollapsed && (
                    <View style={styles.groupItemsContainer}>
                      {group.items.map(item => renderPaymentCard(item))}
                    </View>
                  )}
                </View>
              );
            })
          )}

          {/* 4. CUSTOMER-WISE KHATA VIEW */}
          {viewMode === "customer" && (
            groupedByCustomer.map(group => {
              const isCollapsed = expandedSections[group.customerId || group.name] === true;
              return (
                <View key={group.customerId || group.name} style={styles.groupCard}>
                  <TouchableOpacity
                    style={styles.groupHeader}
                    onPress={() => toggleSection(group.customerId || group.name)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.groupTitle}>
                        {group.name} {group.code ? `(${group.code})` : ""}
                      </Text>
                      <Text style={styles.groupSub}>
                        {group.mobile ? `📱 ${group.mobile} · ` : ""}
                        {group.items.length} {group.items.length === 1 ? "payment" : "payments"}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={styles.groupTotal}>Total Paid: ₹{group.total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</Text>
                      <MaterialCommunityIcons
                        name={isCollapsed ? "chevron-down" : "chevron-up"}
                        size={20}
                        color={colors.textMuted}
                      />
                    </View>
                  </TouchableOpacity>

                  {!isCollapsed && (
                    <View style={styles.groupItemsContainer}>
                      {group.items.map(item => renderPaymentCard(item))}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Edit Payment Modal */}
      <Modal
        visible={!!editingPayment}
        animationType="slide"
        transparent
        onRequestClose={() => setEditingPayment(null)}
      >
        <View style={styles.dateModalBg}>
          <View style={styles.editSheet}>
            <View style={styles.pickerSheetHandle} />
            <Text style={styles.pickerSheetTitle}>Edit Payment</Text>
            {editingPayment && (
              <Text style={styles.editSubInfo}>
                {editingPayment.customer_name || "Customer"} · Batch: {editingPayment.batch_no}
              </Text>
            )}

            <Text style={styles.editFieldLabel}>Amount (₹) *</Text>
            <TextInput
              style={styles.editInput}
              keyboardType="decimal-pad"
              value={editAmount}
              onChangeText={setEditAmount}
              placeholder="0.00"
              placeholderTextColor={colors.textLight}
            />

            <Text style={styles.editFieldLabel}>Payment Mode *</Text>
            <View style={styles.modeRow}>
              {MODES.map(m => (
                <TouchableOpacity
                  key={m}
                  style={[styles.modeButton, editMode === m && styles.modeButtonActive]}
                  onPress={() => setEditMode(m)}
                >
                  <Text style={[styles.modeButtonText, editMode === m && styles.modeButtonTextActive]}>
                    {m}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.editFieldLabel}>Payment Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.editInput}
              value={editDate}
              onChangeText={setEditDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textLight}
            />

            <Text style={styles.editFieldLabel}>Remarks / Reference No.</Text>
            <TextInput
              style={styles.editInput}
              value={editRemarks}
              onChangeText={setEditRemarks}
              placeholder="e.g. Ledger folio #, UPI ref, Cheque #"
              placeholderTextColor={colors.textLight}
            />

            <View style={styles.editActions}>
              {user?.role === "Admin" && (
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={handleDeletePayment}
                  disabled={savingEdit}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color="#D32F2F" />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setEditingPayment(null)}
                disabled={savingEdit}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSaveEdit}
                disabled={savingEdit}
              >
                {savingEdit ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Date Picker Modal */}
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
                  testID="payments-start-date"
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
                  testID="payments-end-date"
                  style={styles.dateInput}
                  value={draftEnd}
                  onChangeText={setDraftEnd}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textLight}
                />
              </View>
            </View>

            <View style={styles.pickerSheetActions}>
              <TouchableOpacity testID="payments-range-cancel" style={styles.pickerSheetCancel} onPress={() => setPickerOpen(false)}>
                <Text style={styles.pickerSheetCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="payments-range-apply"
                style={styles.pickerSheetApply}
                onPress={() => {
                  setStartDate(draftStart);
                  setEndDate(draftEnd);
                  setPickerOpen(false);
                }}
              >
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
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  subTitle: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  addPaymentBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: radius.pill,
    gap: 4,
    ...shadow.sm,
  },
  addPaymentBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  viewModeTabs: {
    flexDirection: "row",
    marginHorizontal: spacing.xl,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  viewTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    borderRadius: radius.pill,
    gap: 4,
  },
  viewTabActive: {
    backgroundColor: colors.primary,
  },
  viewTabText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
  },
  viewTabTextActive: {
    color: "#fff",
    fontWeight: "700",
  },
  cashBookSummaryCard: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  cashBookRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cashBookLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase" },
  cashBookVal: { fontSize: 20, fontWeight: "800", marginTop: 2 },
  cashBookSub: { fontSize: 10, color: colors.textLight, marginTop: 1 },
  netCashRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  netCashLabel: { fontSize: 10, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase" },
  netCashVal: { fontSize: 18, fontWeight: "800", marginTop: 1 },
  cashInHandBox: {
    backgroundColor: "#F1F8E9",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    alignItems: "flex-end",
  },
  cashInHandLabel: { fontSize: 10, color: "#2E7D32", fontWeight: "700" },
  cashInHandVal: { fontSize: 14, fontWeight: "800", color: "#1B5E20", marginTop: 1 },
  totalCard: {
    backgroundColor: colors.primary,
    marginHorizontal: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.xl,
    ...shadow.card,
  },
  totalLabel: {
    color: "#B9F6CA",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  totalValue: { color: "#fff", fontSize: 24, fontWeight: "800", marginTop: 2 },
  totalSub: { color: "#E8F5E9", fontSize: 11, marginTop: 1 },
  totalDateRange: { color: "#E8F5E9", fontSize: 11, fontWeight: "600" },
  reconcileRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.2)",
  },
  reconcileChip: {
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  reconcileChipLabel: { color: "#fff", fontSize: 10, fontWeight: "600" },
  reconcileChipVal: { color: "#fff", fontSize: 11, fontWeight: "800" },
  scrollList: {
    paddingHorizontal: spacing.xl,
    paddingBottom: 100,
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  groupCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadow.sm,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    backgroundColor: "#F9FBF9",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  groupTitle: { fontSize: 13, fontWeight: "800", color: colors.text },
  groupSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  groupTotal: { fontSize: 14, fontWeight: "800", color: colors.primary },
  groupItemsContainer: {
    padding: spacing.sm,
    gap: spacing.xs,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    padding: spacing.sm,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  amount: { fontSize: 14, fontWeight: "800", color: colors.text },
  modeChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  modeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  meta: { fontSize: 12, color: colors.text, marginTop: 1, fontWeight: "500" },
  remarksText: { fontSize: 11, color: colors.textMuted, fontStyle: "italic", marginTop: 1 },
  date: { fontSize: 10, color: colors.textLight, marginTop: 1 },
  branchBadge: { backgroundColor: colors.primary50, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
  branchBadgeText: { fontSize: 10, color: colors.primary, fontWeight: "800" },
  editActionBtn: {
    padding: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.primary50,
  },
  emptyContainer: { alignItems: "center", marginTop: 40, gap: 8 },
  empty: { textAlign: "center", color: colors.textMuted, fontSize: 13 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  searchInput: { flex: 1, paddingVertical: 8, fontSize: 13, color: colors.text },
  dateFilterContainer: {
    paddingVertical: spacing.xs,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.xs,
  },
  dateScroll: {
    paddingHorizontal: spacing.xl,
    gap: spacing.xs,
  },
  datePill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
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
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
  },
  datePillTextActive: {
    color: "#ffffff",
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
  editSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: spacing.xl,
    paddingBottom: 40,
  },
  editSubInfo: {
    textAlign: "center",
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: spacing.md,
  },
  editFieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    marginTop: spacing.sm,
    marginBottom: 4,
  },
  editInput: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: spacing.xs,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  modeButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modeButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
  },
  modeButtonTextActive: {
    color: "#fff",
  },
  editActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
    alignItems: "center",
  },
  deleteBtn: {
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: "#FFEBEE",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  cancelBtnText: {
    color: colors.textMuted,
    fontWeight: "700",
    fontSize: 13,
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  saveBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
});
