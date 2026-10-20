import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform, Modal, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { StatusPill } from "@/src/components/ui";

function fmtDate(iso?: string | null) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso).slice(0, 10);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return String(iso).slice(0, 10);
  }
}

export default function CustomerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Merge state
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [customerOptions, setCustomerOptions] = useState<any[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<any>(null);
  const [merging, setMerging] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Tab state: arrivals, ledger (khata), or payments
  const [activeTab, setActiveTab] = useState<"arrivals" | "ledger" | "payments">("arrivals");

  // Edit payment modal state
  const [editingPayment, setEditingPayment] = useState<any | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editMode, setEditMode] = useState("Cash");
  const [editDate, setEditDate] = useState("");
  const [editRemarks, setEditRemarks] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const openEditPayment = (p: any) => {
    setEditingPayment(p);
    setEditAmount(String(p.amount || p.credit || ""));
    setEditMode(p.mode || "Cash");
    setEditDate((p.created_at || p.date || "").slice(0, 10));
    setEditRemarks(p.remarks || "");
  };

  const handleSavePaymentEdit = async () => {
    if (!editingPayment) return;
    const a = parseFloat(editAmount);
    if (isNaN(a) || a <= 0) {
      toast.show("Please enter a valid amount greater than 0", "error");
      return;
    }
    setSavingEdit(true);
    try {
      const pid = editingPayment.id || editingPayment.raw_id;
      await api(`/payments/${pid}`, {
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

  const handleDeletePayment = () => {
    if (!editingPayment) return;
    const pid = editingPayment.id || editingPayment.raw_id;
    Alert.alert(
      "Delete Payment",
      "Are you sure you want to delete this payment? Customer ledger and batch balance will be recalculated.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setSavingEdit(true);
            try {
              await api(`/payments/${pid}`, { method: "DELETE" });
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

  // Arrivals ledger state
  const [arrivalSearch, setArrivalSearch] = useState("");
  const [arrivalFilter, setArrivalFilter] = useState<"All" | "Pending" | "Paid">("All");

  const confirmDelete = () => {
    setDeleteConfirmOpen(true);
  };

  const handleDelete = async () => {
    try {
      await api(`/customers/${id}`, { method: "DELETE" });
      toast.show("Customer deleted successfully");
      router.back();
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  };

  const openMergeModal = async () => {
    setMergeModalOpen(true);
    setSelectedTarget(null);
    setMergeSearch("");
    setLoadingOptions(true);
    try {
      const list = await api<any[]>("/customers");
      // Filter out the current customer and deleted ones
      setCustomerOptions((list || []).filter(c => c.id !== id && !c.is_deleted));
    } catch (e: any) {
      toast.show("Failed to load customer list", "error");
    } finally {
      setLoadingOptions(false);
    }
  };

  const handleMerge = async () => {
    if (!selectedTarget) {
      toast.show("Please select the target customer to merge into", "error");
      return;
    }
    setMerging(true);
    try {
      await api("/customers/merge", {
        method: "POST",
        body: {
          source_customer_id: id,
          target_customer_id: selectedTarget.id,
        },
      });
      toast.show(`Successfully merged into ${selectedTarget.name}`);
      setMergeModalOpen(false);
      router.replace(`/customer/${selectedTarget.id}`);
    } catch (e: any) {
      toast.show(e.message || "Failed to merge customer", "error");
    } finally {
      setMerging(false);
    }
  };

  const load = useCallback(async () => {
    if (!id || id === "[id]") return;
    try {
      const d = await api<any>(`/customers/${id}`);
      setData(d);
    } catch (e: any) {
      toast.show(e.message || "Failed to load customer", "error");
    } finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filteredCandidates = React.useMemo(() => {
    return customerOptions.filter(c => {
      if (!mergeSearch.trim()) return true;
      const q = mergeSearch.toLowerCase();
      return (
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.code && c.code.toLowerCase().includes(q)) ||
        (c.mobile && c.mobile.includes(q)) ||
        (c.village && c.village.toLowerCase().includes(q))
      );
    });
  }, [customerOptions, mergeSearch]);

  const filteredArrivals = React.useMemo(() => {
    let list = data?.history || [];
    if (arrivalFilter === "Pending") {
      list = list.filter((b: any) => (b.balance_amount || 0) > 0);
    } else if (arrivalFilter === "Paid") {
      list = list.filter((b: any) => (b.balance_amount || 0) <= 0);
    }
    if (arrivalSearch.trim()) {
      const q = arrivalSearch.toLowerCase().trim();
      list = list.filter((b: any) =>
        (b.batch_no && b.batch_no.toLowerCase().includes(q)) ||
        (b.product_name && b.product_name.toLowerCase().includes(q)) ||
        (b.arrival_date && b.arrival_date.toLowerCase().includes(q)) ||
        (b.status && b.status.toLowerCase().includes(q))
      );
    }
    return list;
  }, [data?.history, arrivalFilter, arrivalSearch]);

  if (loading) {
    return <SafeAreaView style={styles.safe}><ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} /></SafeAreaView>;
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Customer data not found.</Text>
          <TouchableOpacity style={styles.errorBtn} onPress={() => router.back()}>
            <Text style={styles.errorBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const s = data.stats || {};

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="customer-detail-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Customer</Text>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {(user?.role === "Admin" || user?.role === "Manager" || user?.role === "Store Incharge") && (
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/customer-form", params: { id } })}
              testID="customer-edit"
              style={{ marginRight: 14 }}
            >
              <MaterialCommunityIcons name="pencil" size={22} color={colors.primary} />
            </TouchableOpacity>
          )}
          {(user?.role === "Admin" || user?.role === "Manager") && (
            <TouchableOpacity
              onPress={openMergeModal}
              testID="customer-merge"
              style={{ marginRight: user?.role === "Admin" ? 14 : 0 }}
            >
              <MaterialCommunityIcons name="call-merge" size={22} color={colors.accent} />
            </TouchableOpacity>
          )}
          {user?.role === "Admin" && (
            <TouchableOpacity onPress={confirmDelete} testID="customer-delete">
              <MaterialCommunityIcons name="trash-can-outline" size={22} color={colors.danger} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.hero}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{data.name.slice(0, 1).toUpperCase()}</Text></View>
          <Text style={styles.name}>{data.name}</Text>
          <View style={styles.codePill}><Text style={styles.codeText}>{data.code}</Text></View>
          <Text style={styles.mobile}>{data.mobile}</Text>
          {data.village || data.district ? (
            <Text style={styles.location}>
              <MaterialCommunityIcons name="map-marker" size={12} color={colors.textMuted} /> {[data.village, data.taluk, data.district].filter(Boolean).join(", ")}
            </Text>
          ) : null}
          {data.branch_name && data.branch_name !== "-" ? (
            <Text style={styles.branch}>
              <MaterialCommunityIcons name="storefront" size={12} color={colors.primary} /> {data.branch_name}
            </Text>
          ) : null}
        </View>

        <View style={styles.statsGrid}>
          <Stat label="Total Arrivals" value={String(s.total_visits || 0)} icon="calendar-check" />
          <Stat label="Total Weight" value={`${(s.total_weight || 0).toFixed(0)} kg`} icon="weight-kilogram" />
          <Stat label="Total Billed" value={`₹${(s.total_revenue || 0).toLocaleString("en-IN")}`} icon="currency-inr" />
          <Stat label="Pending Bal" value={`₹${(s.pending_balance || 0).toLocaleString("en-IN")}`} icon="clock-alert-outline" danger={(s.pending_balance || 0) > 0} />
        </View>

        {/* Customer Sub-tabs: Arrivals | Khata Ledger | Payments */}
        <View style={styles.customerSubTabs}>
          <TouchableOpacity
            style={[styles.customerSubTab, activeTab === "arrivals" && styles.customerSubTabActive]}
            onPress={() => setActiveTab("arrivals")}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="package-variant-closed" size={14} color={activeTab === "arrivals" ? "#fff" : colors.textMuted} />
            <Text style={[styles.customerSubTabText, activeTab === "arrivals" && styles.customerSubTabTextActive]}>
              Arrivals ({(data?.history || []).length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.customerSubTab, activeTab === "ledger" && styles.customerSubTabActive]}
            onPress={() => setActiveTab("ledger")}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="book-open-page-variant" size={14} color={activeTab === "ledger" ? "#fff" : colors.textMuted} />
            <Text style={[styles.customerSubTabText, activeTab === "ledger" && styles.customerSubTabTextActive]}>
              Khata Ledger
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.customerSubTab, activeTab === "payments" && styles.customerSubTabActive]}
            onPress={() => setActiveTab("payments")}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="cash-multiple" size={14} color={activeTab === "payments" ? "#fff" : colors.textMuted} />
            <Text style={[styles.customerSubTabText, activeTab === "payments" && styles.customerSubTabTextActive]}>
              Payments ({(data?.payments || []).length})
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === "arrivals" && (
        <View style={styles.section}>
          <View style={styles.arrivalsSectionHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Customer Arrivals</Text>
              <Text style={styles.arrivalsCountSub}>
                Showing {filteredArrivals.length} of {(data.history || []).length} arrivals
              </Text>
            </View>
            <TouchableOpacity
              style={styles.newArrivalBtn}
              onPress={() => router.push({ pathname: "/arrival-form", params: { customer_id: id } })}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="plus" size={16} color="#fff" />
              <Text style={styles.newArrivalBtnText}>New Arrival</Text>
            </TouchableOpacity>
          </View>

          {/* Search bar inside customer arrivals */}
          {(data.history || []).length > 0 && (
            <>
              <View style={styles.arrivalSearchBox}>
                <MaterialCommunityIcons name="magnify" size={18} color={colors.textMuted} />
                <TextInput
                  style={styles.arrivalSearchInput}
                  placeholder="Search batch #, product, date..."
                  placeholderTextColor={colors.textLight}
                  value={arrivalSearch}
                  onChangeText={setArrivalSearch}
                />
                {arrivalSearch ? (
                  <TouchableOpacity onPress={() => setArrivalSearch("")}>
                    <MaterialCommunityIcons name="close-circle" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Filter chips */}
              <View style={styles.arrivalFilterRow}>
                {(["All", "Pending", "Paid"] as const).map(f => {
                  const count =
                    f === "All"
                      ? (data.history || []).length
                      : f === "Pending"
                      ? (data.history || []).filter((b: any) => (b.balance_amount || 0) > 0).length
                      : (data.history || []).filter((b: any) => (b.balance_amount || 0) <= 0).length;
                  const active = arrivalFilter === f;
                  return (
                    <TouchableOpacity
                      key={f}
                      onPress={() => setArrivalFilter(f)}
                      style={[styles.arrivalFilterPill, active && styles.arrivalFilterPillActive]}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.arrivalFilterText, active && styles.arrivalFilterTextActive]}>
                        {f === "Pending" ? "Pending Bal" : f} ({count})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {filteredArrivals.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="package-variant-closed" size={40} color={colors.textLight} />
              <Text style={styles.empty}>
                {(data.history || []).length === 0 ? "No arrivals recorded for this customer yet" : "No arrivals match your search"}
              </Text>
            </View>
          ) : (
            filteredArrivals.map((b: any) => {
              const arrivalDt = b.arrival_date || b.created_at;
              const hasBal = (b.balance_amount || 0) > 0;
              return (
                <TouchableOpacity
                  key={b.id}
                  testID={`history-batch-${b.id}`}
                  style={styles.arrivalCard}
                  onPress={() => router.push(`/batch/${b.id}`)}
                  activeOpacity={0.85}
                >
                  <View style={styles.arrivalCardHeader}>
                    <View style={styles.arrivalDateBox}>
                      <MaterialCommunityIcons name="calendar" size={13} color={colors.primary} />
                      <Text style={styles.arrivalDateText}>{fmtDate(arrivalDt)}</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View style={styles.batchChip}>
                        <Text style={styles.batchChipText}>{b.batch_no}</Text>
                      </View>
                      <StatusPill status={b.status} />
                    </View>
                  </View>

                  <View style={styles.arrivalProductRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.arrivalProductName}>{b.product_name || "Cardamom"}</Text>
                      <Text style={styles.arrivalMachineText}>
                        {b.branch_name || "Main Branch"}{b.machine_name ? ` · Dryer: ${b.machine_name}` : ""}
                      </Text>
                    </View>
                    <View style={styles.arrivalWeightBox}>
                      <Text style={styles.arrivalWeightVal}>{b.raw_weight} KG</Text>
                      {b.rate_per_kg ? (
                        <Text style={styles.arrivalRateText}>@ ₹{b.rate_per_kg}/kg</Text>
                      ) : null}
                    </View>
                  </View>

                  {/* Ledger Financials Row */}
                  <View style={styles.ledgerRow}>
                    <View style={styles.ledgerCol}>
                      <Text style={styles.ledgerLabel}>Total Bill</Text>
                      <Text style={styles.ledgerValue}>₹{(b.bill_amount || 0).toLocaleString("en-IN")}</Text>
                    </View>
                    <View style={styles.ledgerDivider} />
                    <View style={styles.ledgerCol}>
                      <Text style={styles.ledgerLabel}>Received</Text>
                      <Text style={[styles.ledgerValue, { color: colors.success }]}>
                        ₹{(b.total_paid || 0).toLocaleString("en-IN")}
                      </Text>
                    </View>
                    <View style={styles.ledgerDivider} />
                    <View style={styles.ledgerCol}>
                      <Text style={styles.ledgerLabel}>Balance</Text>
                      <Text style={[styles.ledgerValue, hasBal ? { color: colors.accent } : { color: colors.success }]}>
                        {hasBal ? `₹${(b.balance_amount || 0).toLocaleString("en-IN")}` : "Paid ✓"}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
        )}

        {/* 2. KHATA ACCOUNT LEDGER TAB */}
        {activeTab === "ledger" && (
          <View style={styles.section}>
            <View style={styles.arrivalsSectionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Account Statement (Khata)</Text>
                <Text style={styles.arrivalsCountSub}>
                  Chronological billing & payment ledger with running balance
                </Text>
              </View>
              <TouchableOpacity
                style={styles.newArrivalBtn}
                onPress={() => router.push({ pathname: "/payment-form", params: { customer_id: id, branch_id: data?.branch_id } })}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="plus" size={16} color="#fff" />
                <Text style={styles.newArrivalBtnText}>+ Add Payment</Text>
              </TouchableOpacity>
            </View>

            {/* Ledger Balance Summary Card */}
            <View style={styles.khataBalanceCard}>
              <View style={styles.khataBalanceRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.khataBalanceLabel}>Total Billed (Debits)</Text>
                  <Text style={styles.khataBalanceVal}>₹{(s.total_revenue || 0).toLocaleString("en-IN")}</Text>
                </View>
                <View style={{ width: 1, backgroundColor: colors.border, marginHorizontal: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.khataBalanceLabel}>Total Paid (Credits)</Text>
                  <Text style={[styles.khataBalanceVal, { color: colors.success }]}>
                    ₹{(s.total_paid || 0).toLocaleString("en-IN")}
                  </Text>
                </View>
              </View>
              <View style={styles.khataClosingRow}>
                <Text style={styles.khataClosingLabel}>Closing Balance Due:</Text>
                <Text style={[styles.khataClosingVal, (s.pending_balance || 0) > 0 ? { color: "#D32F2F" } : { color: colors.success }]}>
                  {(s.pending_balance || 0) > 0 ? `₹${(s.pending_balance || 0).toLocaleString("en-IN")} (Due)` : "All Cleared ✓"}
                </Text>
              </View>
            </View>

            {/* Ledger List */}
            {(!data?.ledger || data.ledger.length === 0) ? (
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons name="book-open-outline" size={40} color={colors.textLight} />
                <Text style={styles.empty}>No ledger transactions recorded yet</Text>
              </View>
            ) : (
              data.ledger.map((entry: any, idx: number) => {
                const isDebit = entry.type === "debit";
                return (
                  <View key={`ledger-${idx}`} style={[styles.khataEntryCard, isDebit ? styles.khataDebitBorder : styles.khataCreditBorder]}>
                    <View style={styles.khataEntryHeader}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <View style={[styles.khataBadge, isDebit ? styles.khataBadgeDebit : styles.khataBadgeCredit]}>
                          <Text style={[styles.khataBadgeText, isDebit ? { color: "#D32F2F" } : { color: "#2E7D32" }]}>
                            {isDebit ? "CHARGES (DEBIT)" : "PAYMENT (CREDIT)"}
                          </Text>
                        </View>
                        <Text style={styles.khataDate}>{fmtDate(entry.date)}</Text>
                      </View>
                      <Text style={styles.khataRef}>Ref: {entry.ref_no}</Text>
                    </View>

                    <Text style={styles.khataDesc}>{entry.description}</Text>

                    <View style={styles.khataAmountsRow}>
                      <View>
                        <Text style={styles.khataColLabel}>{isDebit ? "Billed Amount" : "Paid Amount"}</Text>
                        <Text style={[styles.khataColAmount, isDebit ? { color: "#D32F2F" } : { color: "#2E7D32" }]}>
                          {isDebit ? `+₹${entry.debit.toLocaleString("en-IN")}` : `-₹${entry.credit.toLocaleString("en-IN")}`}
                        </Text>
                      </View>

                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={styles.khataColLabel}>Running Balance</Text>
                        <Text style={[styles.khataColBalance, entry.balance > 0 ? { color: "#E65100" } : { color: colors.success }]}>
                          ₹{entry.balance.toLocaleString("en-IN")}
                        </Text>
                      </View>

                      {!isDebit && (
                        <TouchableOpacity
                          style={styles.editPaymentIconBtn}
                          onPress={() => openEditPayment(entry)}
                          activeOpacity={0.7}
                        >
                          <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.primary} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* 3. PAYMENTS TAB */}
        {activeTab === "payments" && (
          <View style={styles.section}>
            <View style={styles.arrivalsSectionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Payment Receipts</Text>
                <Text style={styles.arrivalsCountSub}>
                  Total Paid: ₹{(s.total_paid || 0).toLocaleString("en-IN")} ({(data?.payments || []).length} receipts)
                </Text>
              </View>
              <TouchableOpacity
                style={styles.newArrivalBtn}
                onPress={() => router.push({ pathname: "/payment-form", params: { customer_id: id, branch_id: data?.branch_id } })}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="plus" size={16} color="#fff" />
                <Text style={styles.newArrivalBtnText}>+ Add Payment</Text>
              </TouchableOpacity>
            </View>

            {(!data?.payments || data.payments.length === 0) ? (
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons name="cash-remove" size={40} color={colors.textLight} />
                <Text style={styles.empty}>No payments received from this customer yet</Text>
              </View>
            ) : (
              data.payments.map((p: any) => (
                <View key={p.id} style={styles.customerPaymentCard}>
                  <View style={styles.customerPaymentHeader}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={styles.customerPaymentAmount}>₹{Number(p.amount).toFixed(2)}</Text>
                      <View style={[styles.modeChip, { backgroundColor: `${colors.primary}20` }]}>
                        <Text style={[styles.modeText, { color: colors.primary }]}>{p.mode}</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.editPaymentIconBtn}
                      onPress={() => openEditPayment(p)}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.primary} />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.customerPaymentBatch}>Batch: {p.batch_no || "Advance Settlement"}</Text>
                  {p.remarks ? <Text style={styles.customerPaymentRemarks}>📝 {p.remarks}</Text> : null}
                  <Text style={styles.customerPaymentDate}>
                    {new Date(p.created_at).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* Merge Customer Modal */}
      <Modal
        visible={mergeModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setMergeModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setMergeModalOpen(false)} />
          <View style={[styles.modalSheet, { maxHeight: "85%" }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Merge Customer</Text>
            
            <Text style={styles.deleteWarningText}>
              Merge <Text style={{ fontWeight: "800", color: colors.text }}>{data.name} ({data.code})</Text> into another customer. All batches, historical records, and payments will be transferred to the target customer.
            </Text>

            <Text style={styles.sectionSubtitle}>Select Primary Customer to keep:</Text>
            
            <View style={styles.searchBox}>
              <MaterialCommunityIcons name="magnify" size={20} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by name, code, or phone..."
                placeholderTextColor={colors.textLight}
                value={mergeSearch}
                onChangeText={setMergeSearch}
              />
              {mergeSearch ? (
                <TouchableOpacity onPress={() => setMergeSearch("")}>
                  <MaterialCommunityIcons name="close-circle" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>

            {loadingOptions ? (
              <ActivityIndicator style={{ marginVertical: 20 }} color={colors.primary} />
            ) : (
              <ScrollView style={{ maxHeight: 220, marginBottom: spacing.md }} keyboardShouldPersistTaps="handled">
                {filteredCandidates.length === 0 ? (
                  <Text style={{ textAlign: "center", color: colors.textMuted, marginVertical: 15, fontSize: 13 }}>
                    No matching customer found
                  </Text>
                ) : (
                  filteredCandidates.map(c => {
                    const isSelected = selectedTarget?.id === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() => setSelectedTarget(c)}
                        style={[styles.candidateRow, isSelected && styles.candidateRowSelected]}
                      >
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Text style={[styles.candidateName, isSelected && { color: colors.primary }]}>{c.name}</Text>
                            <View style={styles.codePillSmall}><Text style={styles.codeTextSmall}>{c.code}</Text></View>
                          </View>
                          <Text style={styles.candidateMeta}>
                            {c.mobile || "No phone"} {c.village ? `· ${c.village}` : ""}
                          </Text>
                        </View>
                        <MaterialCommunityIcons
                          name={isSelected ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"}
                          size={22}
                          color={isSelected ? colors.primary : colors.border}
                        />
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            )}

            {selectedTarget && (
              <View style={styles.targetPreview}>
                <Text style={styles.previewTitle}>Action Preview:</Text>
                <Text style={styles.previewText}>
                  • <Text style={{ fontWeight: "700" }}>{data.name} ({data.code})</Text> will be deactivated.
                </Text>
                <Text style={styles.previewText}>
                  • All batches & payments will be moved to <Text style={{ fontWeight: "700", color: colors.primary }}>{selectedTarget.name} ({selectedTarget.code})</Text>.
                </Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setMergeModalOpen(false)}
                disabled={merging}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalActionBtn, !selectedTarget && { opacity: 0.5 }]}
                onPress={handleMerge}
                disabled={!selectedTarget || merging}
              >
                {merging ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalActionBtnText}>Confirm Merge</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal with Customer Details */}
      <Modal
        visible={deleteConfirmOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setDeleteConfirmOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setDeleteConfirmOpen(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Confirm Deletion</Text>
            
            <Text style={styles.deleteWarningText}>
              Are you sure you want to permanently delete this customer? This action cannot be undone.
            </Text>

            {/* Customer Details Panel */}
            <View style={styles.confirmDetailsBox}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Customer Code</Text>
                <Text style={styles.detailValue}>{data.code}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Name</Text>
                <Text style={styles.detailValue}>{data.name}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Mobile</Text>
                <Text style={styles.detailValue}>{data.mobile}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Branch</Text>
                <Text style={styles.detailValue}>{data.branch_name || "-"}</Text>
              </View>
              <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.detailLabel}>Total Visits</Text>
                <Text style={styles.detailValue}>{s.total_visits || 0}</Text>
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setDeleteConfirmOpen(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalDeleteBtn}
                onPress={() => {
                  setDeleteConfirmOpen(false);
                  handleDelete();
                }}
              >
                <Text style={styles.modalDeleteText}>Delete Customer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Payment Modal */}
      <Modal
        visible={!!editingPayment}
        animationType="slide"
        transparent
        onRequestClose={() => setEditingPayment(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setEditingPayment(null)} />
          <View style={styles.editSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Edit Customer Payment</Text>
            {editingPayment && (
              <Text style={styles.editSubInfo}>
                Receipt ID: {(editingPayment.id || editingPayment.raw_id || "").slice(0, 8)} · Ref: {editingPayment.batch_no || editingPayment.ref_no || "Advance"}
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
              {["Cash", "UPI", "Bank", "Credit"].map(m => (
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
                onPress={handleSavePaymentEdit}
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
    </SafeAreaView>
  );
}

function Stat({ label, value, icon, danger }: any) {
  return (
    <View style={styles.stat}>
      <MaterialCommunityIcons name={icon} size={18} color={danger ? colors.danger : colors.primary} />
      <Text style={[styles.statValue, danger && { color: colors.danger }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { fontSize: 18, fontWeight: "800", color: colors.text },
  hero: { alignItems: "center", padding: spacing.xl, gap: 4 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  avatarText: { fontSize: 32, fontWeight: "800", color: "#fff" },
  name: { fontSize: 22, fontWeight: "800", color: colors.text },
  codePill: { paddingHorizontal: 10, paddingVertical: 3, backgroundColor: colors.accent + "20", borderRadius: radius.pill, marginTop: 6 },
  codeText: { fontSize: 12, fontWeight: "800", color: colors.accent },
  mobile: { fontSize: 14, color: colors.textMuted, marginTop: 6 },
  location: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  branch: { fontSize: 12, color: colors.primary, fontWeight: "700", marginTop: 4 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: spacing.xl, gap: spacing.md, marginBottom: spacing.lg },
  stat: { width: "47.5%", backgroundColor: colors.card, padding: spacing.lg, borderRadius: radius.xl, ...shadow.card, gap: 4 },
  statValue: { fontSize: 18, fontWeight: "800", color: colors.text },
  statLabel: { fontSize: 12, color: colors.textMuted },
  section: { marginHorizontal: spacing.xl, backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.lg, ...shadow.card },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  arrivalsSectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  arrivalsCountSub: { fontSize: 12, color: colors.textMuted, marginTop: 2, fontWeight: "500" },
  newArrivalBtn: { flexDirection: "row", alignItems: "center", backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, gap: 4 },
  newArrivalBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  arrivalSearchBox: { flexDirection: "row", alignItems: "center", backgroundColor: colors.bg, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 7, marginTop: 4, marginBottom: 8, gap: 8, borderWidth: 1, borderColor: colors.border },
  arrivalSearchInput: { flex: 1, fontSize: 13, color: colors.text, padding: 0 },
  arrivalFilterRow: { flexDirection: "row", gap: 6, marginBottom: spacing.md },
  arrivalFilterPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  arrivalFilterPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  arrivalFilterText: { fontSize: 11, fontWeight: "700", color: colors.textMuted },
  arrivalFilterTextActive: { color: "#fff" },
  emptyContainer: { alignItems: "center", paddingVertical: spacing.xl, gap: spacing.xs },
  empty: { fontSize: 13, color: colors.textMuted, textAlign: "center" },
  arrivalCard: {
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  arrivalCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  arrivalDateBox: { flexDirection: "row", alignItems: "center", gap: 4 },
  arrivalDateText: { fontSize: 12, fontWeight: "700", color: colors.text },
  batchChip: { backgroundColor: colors.card, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  batchChipText: { fontSize: 11, fontWeight: "800", color: colors.text },
  arrivalProductRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  arrivalProductName: { fontSize: 14, fontWeight: "800", color: colors.text },
  arrivalMachineText: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  arrivalWeightBox: { alignItems: "flex-end" },
  arrivalWeightVal: { fontSize: 15, fontWeight: "800", color: colors.primary },
  arrivalRateText: { fontSize: 11, color: colors.textMuted, fontWeight: "600", marginTop: 1 },
  ledgerRow: { flexDirection: "row", backgroundColor: colors.card, borderRadius: radius.md, paddingVertical: 6, paddingHorizontal: 8, alignItems: "center", borderWidth: 1, borderColor: colors.border + "80" },
  ledgerCol: { flex: 1, alignItems: "center" },
  ledgerLabel: { fontSize: 10, color: colors.textMuted, fontWeight: "600", textTransform: "uppercase" },
  ledgerValue: { fontSize: 12, fontWeight: "800", color: colors.text, marginTop: 1 },
  ledgerDivider: { width: 1, height: 20, backgroundColor: colors.border },
  batchRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  batchNo: { fontSize: 14, fontWeight: "800", color: colors.text },
  batchMeta: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  modalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  sectionSubtitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 8,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    fontSize: 14,
    color: colors.text,
  },
  candidateRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 6,
    backgroundColor: "#fff",
  },
  candidateRowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + "10",
  },
  candidateName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  candidateMeta: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  codePillSmall: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.accent + "20",
    borderRadius: radius.pill,
  },
  codeTextSmall: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.accent,
  },
  targetPreview: {
    backgroundColor: colors.bg,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    gap: 4,
  },
  previewTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  previewText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  deleteWarningText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  confirmDetailsBox: {
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  detailLabel: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: "600",
  },
  detailValue: {
    fontSize: 13,
    color: colors.text,
    fontWeight: "700",
  },
  modalActions: {
    flexDirection: "row",
    gap: spacing.md,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textMuted,
  },
  modalActionBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  modalActionBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#fff",
  },
  modalDeleteBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  modalDeleteText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#fff",
  },
  errorContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.xl, gap: spacing.md },
  errorText: { fontSize: 16, color: colors.textMuted, textAlign: "center", fontWeight: "600" },
  errorBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.primary, borderRadius: radius.pill },
  errorBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  customerSubTabs: {
    flexDirection: "row",
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  customerSubTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    borderRadius: radius.pill,
    gap: 4,
  },
  customerSubTabActive: {
    backgroundColor: colors.primary,
  },
  customerSubTabText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
  },
  customerSubTabTextActive: {
    color: "#fff",
    fontWeight: "700",
  },
  khataBalanceCard: {
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  khataBalanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  khataBalanceLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  khataBalanceVal: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
    marginTop: 2,
  },
  khataClosingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  khataClosingLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  khataClosingVal: {
    fontSize: 15,
    fontWeight: "800",
  },
  khataEntryCard: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  khataDebitBorder: {
    borderLeftColor: "#D32F2F",
  },
  khataCreditBorder: {
    borderLeftColor: "#2E7D32",
  },
  khataEntryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  khataBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  khataBadgeDebit: {
    backgroundColor: "#FFEBEE",
  },
  khataBadgeCredit: {
    backgroundColor: "#E8F5E9",
  },
  khataBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  khataDate: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "600",
  },
  khataRef: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "700",
  },
  khataDesc: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    marginTop: 2,
    marginBottom: 6,
  },
  khataAmountsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  khataColLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  khataColAmount: {
    fontSize: 13,
    fontWeight: "800",
    marginTop: 1,
  },
  khataColBalance: {
    fontSize: 13,
    fontWeight: "800",
    marginTop: 1,
  },
  editPaymentIconBtn: {
    padding: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.primary50,
    marginLeft: 6,
  },
  customerPaymentCard: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  customerPaymentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  customerPaymentAmount: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  customerPaymentBatch: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
    marginTop: 4,
  },
  customerPaymentRemarks: {
    fontSize: 11,
    color: colors.textMuted,
    fontStyle: "italic",
    marginTop: 2,
  },
  customerPaymentDate: {
    fontSize: 11,
    color: colors.textLight,
    marginTop: 4,
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
  modeChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  modeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
});
