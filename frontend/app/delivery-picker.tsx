import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/auth";
import Loader from "@/src/components/Loader";
import { storage } from "@/src/utils/storage";

type Batch = {
  id: string;
  batch_no: string;
  status: string;
  raw_weight: number;
  actual_dry_weight?: number;
  padi_weight?: number;
  processed_bags?: number;
  arrival_date?: string;
  created_at?: string;
  processing_started_at?: string;
  processing_ended_at?: string;
  branch_id?: string;
  branch_name?: string;
  customer_id?: string;
  customer?: { id: string; name: string; code: string; mobile: string };
  product?: { name: string };
  balance_amount?: number;
  rate_per_kg?: number;
};

type CustomerGroup = {
  customerId: string;
  customerName: string;
  customerCode: string;
  customerMobile: string;
  branchName?: string;
  batches: Batch[];
  totalArrivalLots: number;
  totalWetWeight: number;
  totalDryWeight: number;
  avgPadiWeight: number;
};

const PAYMENT_MODES = ["Cash", "UPI", "Bank", "Credit"];

function fmtDate(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

export default function DeliveryPicker() {
  const router = useRouter();
  const toast = useToast();
  const { selectedBranchId, branches } = useAuth();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");

  // Customer expansion state
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);

  // Multi-selection: set of selected batch IDs
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());

  // Delivery Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [activeCustomer, setActiveCustomer] = useState<CustomerGroup | null>(null);
  const [delivDryWeight, setDelivDryWeight] = useState("");
  const [delivBags, setDelivBags] = useState("");
  const [delivRate, setDelivRate] = useState("12");
  const [delivAmountReceived, setDelivAmountReceived] = useState("");
  const [delivPaymentMode, setDelivPaymentMode] = useState("Cash");
  const [delivReceivedBy, setDelivReceivedBy] = useState("");
  const [delivReceivedPhone, setDelivReceivedPhone] = useState("");
  const [delivDate, setDelivDate] = useState(new Date().toISOString().slice(0, 10));
  const [delivRemarks, setDelivRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const activeBranchName = selectedBranchId
    ? branches.find(b => b.id === selectedBranchId)?.name || "Selected Branch"
    : "All Branches";

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ status: "Completed" });
      if (selectedBranchId) {
        qs.set("branch_id", selectedBranchId);
      }
      const all = await api<Batch[]>(`/batches?${qs.toString()}`);
      const filteredBranch = selectedBranchId
        ? all.filter(b => b.branch_id === selectedBranchId)
        : all;
      setBatches(filteredBranch);
    } catch (e: any) {
      toast.show(e.message || "Failed to load batches", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedBranchId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load();
  }, [load]));

  // Group completed batches by customer
  const customerGroups: CustomerGroup[] = useMemo(() => {
    const map = new Map<string, CustomerGroup>();

    for (const b of batches) {
      const cid = b.customer?.id || b.customer_id || "unknown";
      if (!map.has(cid)) {
        map.set(cid, {
          customerId: cid,
          customerName: b.customer?.name || "Unknown Customer",
          customerCode: b.customer?.code || "",
          customerMobile: b.customer?.mobile || "",
          branchName: b.branch_name,
          batches: [],
          totalArrivalLots: 0,
          totalWetWeight: 0,
          totalDryWeight: 0,
          avgPadiWeight: 0,
        });
      }
      const group = map.get(cid)!;
      group.batches.push(b);
      group.totalArrivalLots += 1;
      group.totalWetWeight += Number(b.raw_weight || 0);
      group.totalDryWeight += Number(b.actual_dry_weight || 0);
    }

    // Calculate average padi weight and sort batches for each customer
    for (const group of map.values()) {
      let padiSum = 0;
      let padiCount = 0;
      for (const b of group.batches) {
        const pw = Number(b.padi_weight || 0);
        if (pw > 0) {
          padiSum += pw;
          padiCount += 1;
        }
      }
      group.avgPadiWeight = padiCount > 0 ? Math.round((padiSum / padiCount) * 10) / 10 : 0;
      group.batches.sort((a, b) => {
        const da = new Date(a.arrival_date || a.created_at || 0).getTime();
        const db = new Date(b.arrival_date || b.created_at || 0).getTime();
        return db - da;
      });
    }

    return Array.from(map.values()).sort((a, b) => a.customerName.localeCompare(b.customerName));
  }, [batches]);

  // Filter groups by search query
  const filteredGroups = useMemo(() => {
    if (!q.trim()) return customerGroups;
    const term = q.toLowerCase();
    return customerGroups.filter(g =>
      g.customerName.toLowerCase().includes(term) ||
      g.customerMobile.includes(term) ||
      g.customerCode.toLowerCase().includes(term) ||
      g.batches.some(b => b.batch_no?.toLowerCase().includes(term))
    );
  }, [customerGroups, q]);

  // Handle toggling customer accordion
  const toggleCustomer = (group: CustomerGroup) => {
    if (expandedCustomerId === group.customerId) {
      setExpandedCustomerId(null);
    } else {
      setExpandedCustomerId(group.customerId);
      // If no batches selected yet, or selection is from a different customer, pre-select all for this customer
      const currentSelectedFromThisGroup = group.batches.filter(b => selectedBatchIds.has(b.id));
      if (currentSelectedFromThisGroup.length === 0) {
        const newSet = new Set<string>();
        group.batches.forEach(b => newSet.add(b.id));
        setSelectedBatchIds(newSet);
      }
    }
  };

  // Toggle single batch selection
  const toggleBatchSelect = (batchId: string, group: CustomerGroup) => {
    const next = new Set(selectedBatchIds);
    // If selecting a batch from a different customer, clear previous customer selection
    const belongsToGroup = group.batches.some(b => b.id === batchId);
    if (!belongsToGroup) {
      next.clear();
    } else {
      // Clear any selections from other customers to keep delivery customer-scoped
      const groupBatchIds = new Set(group.batches.map(b => b.id));
      for (const id of next) {
        if (!groupBatchIds.has(id)) next.delete(id);
      }
    }

    if (next.has(batchId)) {
      next.delete(batchId);
    } else {
      next.add(batchId);
    }
    setSelectedBatchIds(next);
  };

  // Select all or Deselect all for a group
  const toggleSelectAllGroup = (group: CustomerGroup) => {
    const allSelected = group.batches.every(b => selectedBatchIds.has(b.id));
    const next = new Set<string>();
    if (!allSelected) {
      group.batches.forEach(b => next.add(b.id));
    }
    setSelectedBatchIds(next);
  };

  // Selected aggregates
  const selectedBatches = useMemo(() => {
    return batches.filter(b => selectedBatchIds.has(b.id));
  }, [batches, selectedBatchIds]);

  const selectedAggregates = useMemo(() => {
    const count = selectedBatches.length;
    const totalWet = selectedBatches.reduce((acc, b) => acc + Number(b.raw_weight || 0), 0);
    const totalDry = selectedBatches.reduce((acc, b) => acc + Number(b.actual_dry_weight || 0), 0);
    const totalBags = selectedBatches.reduce((acc, b) => acc + Number(b.processed_bags || 0), 0);
    let padiSum = 0;
    let padiCount = 0;
    for (const b of selectedBatches) {
      const pw = Number(b.padi_weight || 0);
      if (pw > 0) {
        padiSum += pw;
        padiCount += 1;
      }
    }
    const avgPadi = padiCount > 0 ? Math.round((padiSum / padiCount) * 10) / 10 : 0;
    const defaultRate = selectedBatches[0]?.rate_per_kg || 12;

    return { count, totalWet, totalDry, totalBags, avgPadi, defaultRate };
  }, [selectedBatches]);

  // Remove batch directly from inside delivery modal
  const handleRemoveBatchFromModal = (batchId: string) => {
    const next = new Set(selectedBatchIds);
    next.delete(batchId);
    setSelectedBatchIds(next);

    if (next.size === 0) {
      setModalVisible(false);
      toast.show("All lots removed from delivery", "info");
      return;
    }

    const remaining = batches.filter(b => next.has(b.id));
    const newDryTotal = remaining.reduce((acc, b) => acc + Number(b.actual_dry_weight || 0), 0);
    const newBagsTotal = remaining.reduce((acc, b) => acc + Number(b.processed_bags || 0), 0);
    if (newDryTotal > 0) setDelivDryWeight(String(newDryTotal));
    if (newBagsTotal > 0) setDelivBags(String(newBagsTotal));
  };

  // Open delivery modal
  const openDeliveryModal = () => {
    if (selectedBatches.length === 0) return;
    const first = selectedBatches[0];
    const group = customerGroups.find(g => g.customerId === (first.customer?.id || first.customer_id));
    setActiveCustomer(group || null);

    setDelivDryWeight(selectedAggregates.totalDry > 0 ? String(selectedAggregates.totalDry) : "");
    setDelivBags(selectedAggregates.totalBags > 0 ? String(selectedAggregates.totalBags) : "");
    setDelivRate(String(selectedAggregates.defaultRate));
    setDelivAmountReceived("");
    setDelivPaymentMode("Cash");
    setDelivReceivedBy(group?.customerName || first.customer?.name || "");
    setDelivReceivedPhone(group?.customerMobile || first.customer?.mobile || "");
    setDelivDate(new Date().toISOString().slice(0, 10));
    setDelivRemarks("");
    setModalVisible(true);
  };

  // Modal calculated values
  const numDry = parseFloat(delivDryWeight || "0");
  const numRate = parseFloat(delivRate || "0");
  const totalBillAmount = Math.max(0, Math.round(selectedAggregates.totalWet * numRate));
  const numReceived = parseFloat(delivAmountReceived || "0");
  const pendingBalance = Math.max(0, totalBillAmount - numReceived);

  // Submit Bulk / Single Delivery
  const handleConfirmDelivery = async () => {
    if (numDry <= 0) {
      return toast.show("Please enter actual processed dry weight (> 0)", "error");
    }
    if (!delivReceivedBy.trim()) {
      return toast.show("Please enter receiver's name", "error");
    }

    setSubmitting(true);
    try {
      const effectiveMode = numReceived <= 0 ? "Credit" : delivPaymentMode;
      const res = await api<any>("/batches/bulk-delivery", {
        method: "POST",
        body: {
          batch_ids: Array.from(selectedBatchIds),
          actual_dry_weight: numDry,
          processed_bags: parseInt(delivBags || "0", 10),
          rate_per_kg: numRate,
          received_by: delivReceivedBy.trim(),
          received_by_phone: delivReceivedPhone.trim(),
          amount_received: numReceived,
          payment_mode: effectiveMode,
          delivery_date: delivDate ? `${delivDate}T${new Date().toISOString().slice(11, 19)}Z` : undefined,
          remarks: delivRemarks.trim(),
        },
      });

      await storage.removeItem("cached_arrivals_dashboard");
      toast.show(
        `Successfully delivered ${selectedBatchIds.size} lot(s)! WhatsApp statement sent to customer.`,
        "success"
      );
      setModalVisible(false);
      setSelectedBatchIds(new Set());
      setExpandedCustomerId(null);
      load();
    } catch (e: any) {
      toast.show(e.message || "Failed to record delivery", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      {/* Search Header */}
      <View style={styles.searchWrap}>
        <MaterialCommunityIcons name="magnify" size={20} color={colors.textMuted} />
        <TextInput
          testID="delivery-picker-search"
          style={styles.search}
          placeholder="Search customer name, code, mobile or lot..."
          placeholderTextColor={colors.textLight}
          value={q}
          onChangeText={setQ}
        />
        {q ? (
          <TouchableOpacity onPress={() => setQ("")}>
            <MaterialCommunityIcons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Summary Bar */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryCol}>
          <Text style={styles.summaryLabel}>Completed Customers</Text>
          <Text style={styles.summaryVal}>{filteredGroups.length}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryCol}>
          <Text style={styles.summaryLabel}>Total Lots</Text>
          <Text style={styles.summaryVal}>
            {filteredGroups.reduce((acc, g) => acc + g.totalArrivalLots, 0)}
          </Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryCol}>
          <Text style={styles.summaryLabel}>Wet Weight</Text>
          <Text style={styles.summaryVal}>
            {filteredGroups.reduce((acc, g) => acc + g.totalWetWeight, 0).toLocaleString("en-IN", { maximumFractionDigits: 1 })} kg
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <Loader size={76} />
          <Text style={styles.loaderTitle}>Loading Completed Produce...</Text>
          <Text style={styles.loaderSub}>Filtering by {activeBranchName}</Text>
        </View>
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: 130 }}
        >
          {filteredGroups.length === 0 && (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="check-circle-outline" size={48} color={colors.textLight} />
              <Text style={styles.emptyText}>No completed produce ready in {activeBranchName}</Text>
              <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: "center", marginTop: 4 }}>
                Lots must have drying completed before they appear for customer delivery.
              </Text>
            </View>
          )}

          {filteredGroups.map(group => {
            const isExpanded = expandedCustomerId === group.customerId;
            const groupSelectedCount = group.batches.filter(b => selectedBatchIds.has(b.id)).length;
            const allSelected = groupSelectedCount === group.batches.length && group.batches.length > 0;

            return (
              <View key={group.customerId} style={styles.customerCard}>
                {/* Level 1: Customer Summary Card */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={styles.customerHeader}
                  onPress={() => toggleCustomer(group)}
                >
                  <View style={styles.avatarWrap}>
                    <Text style={styles.avatarText}>
                      {(group.customerName || "?").slice(0, 1).toUpperCase()}
                    </Text>
                    {group.customerCode ? (
                      <View style={styles.codeTag}>
                        <Text style={styles.codeTagText}>{group.customerCode}</Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={styles.nameRow}>
                      <Text style={styles.customerName}>{group.customerName}</Text>
                      <View style={styles.readyBadge}>
                        <MaterialCommunityIcons name="check-decagram" size={12} color="#15803D" />
                        <Text style={styles.readyBadgeText}>{group.totalArrivalLots} Lots Ready</Text>
                      </View>
                    </View>

                    <View style={styles.subInfoRow}>
                      <Text style={styles.phoneText}>{group.customerMobile || "No phone"}</Text>
                      {group.branchName ? (
                        <Text style={styles.branchText}>• {group.branchName}</Text>
                      ) : null}
                    </View>

                    {/* Metric Cards Row */}
                    <View style={styles.metricsRow}>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>Total Wet</Text>
                        <Text style={styles.metricVal}>{group.totalWetWeight.toFixed(1)} kg</Text>
                      </View>
                      <View style={styles.metricDivider} />
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>Total Dry</Text>
                        <Text style={styles.metricVal}>{group.totalDryWeight.toFixed(1)} kg</Text>
                      </View>
                      <View style={styles.metricDivider} />
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>Avg Padi</Text>
                        <Text style={[styles.metricVal, { color: group.avgPadiWeight > 0 ? colors.accent : colors.textMuted }]}>
                          {group.avgPadiWeight > 0 ? `${group.avgPadiWeight} g/L` : "-"}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <MaterialCommunityIcons
                    name={isExpanded ? "chevron-up" : "chevron-down"}
                    size={24}
                    color={colors.primary}
                    style={{ alignSelf: "center", marginLeft: 4 }}
                  />
                </TouchableOpacity>

                {/* Level 2: Expanded Day-Wise / Lot-Wise Drilldown */}
                {isExpanded && (
                  <View style={styles.drilldownWrap}>
                    <View style={styles.drilldownHeader}>
                      <Text style={styles.drilldownTitle}>Day-Wise Completed Batches</Text>
                      <TouchableOpacity
                        style={styles.selectAllBtn}
                        onPress={() => toggleSelectAllGroup(group)}
                      >
                        <MaterialCommunityIcons
                          name={allSelected ? "checkbox-marked" : "checkbox-blank-outline"}
                          size={18}
                          color={colors.primary}
                        />
                        <Text style={styles.selectAllText}>
                          {allSelected ? "Deselect All" : "Select All"}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {group.batches.map(b => {
                      const isSelected = selectedBatchIds.has(b.id);
                      return (
                        <TouchableOpacity
                          key={b.id}
                          activeOpacity={0.8}
                          style={[styles.batchRow, isSelected && styles.batchRowSelected]}
                          onPress={() => toggleBatchSelect(b.id, group)}
                        >
                          <View style={styles.checkboxWrap}>
                            <MaterialCommunityIcons
                              name={isSelected ? "checkbox-marked" : "checkbox-blank-outline"}
                              size={22}
                              color={isSelected ? colors.primary : colors.textLight}
                            />
                          </View>

                          <View style={{ flex: 1 }}>
                            <View style={styles.batchTopRow}>
                              <Text style={styles.batchNo}>{b.batch_no}</Text>
                              <View style={styles.dateTag}>
                                <MaterialCommunityIcons name="calendar-arrow-right" size={11} color="#065F46" />
                                <Text style={styles.dateTagText}>
                                  Arr: {fmtDate(b.arrival_date || b.created_at)}
                                </Text>
                              </View>
                              {b.processing_ended_at ? (
                                <View style={[styles.dateTag, { backgroundColor: "#F0FDF4", borderColor: "#86EFAC" }]}>
                                  <MaterialCommunityIcons name="check" size={11} color="#15803D" />
                                  <Text style={[styles.dateTagText, { color: "#15803D" }]}>
                                    Dried: {fmtDate(b.processing_ended_at)}
                                  </Text>
                                </View>
                              ) : null}
                            </View>

                            <View style={styles.batchStatsRow}>
                              <Text style={styles.batchStat}>
                                <Text style={styles.statLabel}>Wet: </Text>
                                <Text style={styles.statVal}>{b.raw_weight} kg</Text>
                              </Text>
                              <Text style={styles.statDot}>•</Text>
                              <Text style={styles.batchStat}>
                                <Text style={styles.statLabel}>Dry: </Text>
                                <Text style={styles.statVal}>
                                  {b.actual_dry_weight ? `${b.actual_dry_weight} kg` : "Pending"}
                                </Text>
                              </Text>
                              <Text style={styles.statDot}>•</Text>
                              <Text style={styles.batchStat}>
                                <Text style={styles.statLabel}>Padi: </Text>
                                <Text style={[styles.statVal, { color: b.padi_weight ? colors.accent : colors.textMuted }]}>
                                  {b.padi_weight ? `${b.padi_weight} g/L` : "-"}
                                </Text>
                              </Text>
                            </View>
                          </View>

                          <TouchableOpacity
                            onPress={() => router.push(`/delivery/${b.id}`)}
                            style={styles.singleDeliverIconBtn}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <MaterialCommunityIcons name="arrow-top-right-thick" size={16} color={colors.textMuted} />
                          </TouchableOpacity>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Floating Bottom Multi-Select Delivery Bar */}
      {selectedBatchIds.size > 0 && (
        <View style={styles.floatingActionBar}>
          <View style={styles.floatingLeft}>
            <View style={styles.floatingBadge}>
              <Text style={styles.floatingBadgeText}>{selectedAggregates.count} Lots Selected</Text>
            </View>
            <Text style={styles.floatingSub}>
              {selectedAggregates.totalWet.toFixed(1)} kg Wet • {selectedAggregates.totalDry.toFixed(1)} kg Dry
              {selectedAggregates.avgPadi > 0 ? ` • ${selectedAggregates.avgPadi} g/L` : ""}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.floatingBtn}
            activeOpacity={0.85}
            onPress={openDeliveryModal}
          >
            <Text style={styles.floatingBtnText}>Deliver ({selectedBatchIds.size})</Text>
            <MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Comprehensive Delivery Capture Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => !submitting && setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Capture Delivery</Text>
                <Text style={styles.modalSubtitle}>
                  {activeCustomer?.customerName} ({selectedBatchIds.size} Lots)
                </Text>
              </View>
              <TouchableOpacity
                disabled={submitting}
                onPress={() => setModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
              keyboardShouldPersistTaps="handled"
            >
              {/* Lots Chips - Bigger and with Remove Option */}
              <View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <Text style={styles.inputLabel}>
                    Selected Lots ({selectedBatches.length})
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted }}>
                    Tap ✕ to remove any lot
                  </Text>
                </View>
                <View style={styles.chipRow}>
                  {selectedBatches.map(b => (
                    <View key={b.id} style={styles.lotChipBig}>
                      <View style={styles.lotChipContent}>
                        <Text style={styles.lotChipBatchNo}>{b.batch_no}</Text>
                        <View style={styles.lotChipWeightBadge}>
                          <Text style={styles.lotChipWeightText}>{b.raw_weight} kg</Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        onPress={() => handleRemoveBatchFromModal(b.id)}
                        style={styles.lotChipRemoveBtn}
                        testID={`remove-batch-${b.id}`}
                      >
                        <MaterialCommunityIcons name="close-circle" size={19} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>

              {/* Produce Weights */}
              <View style={styles.formSection}>
                <Text style={styles.sectionHeader}>1. Produce Output</Text>
                <View style={styles.twoCol}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Total Dry Weight (kg) *</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={delivDryWeight}
                      onChangeText={setDelivDryWeight}
                      placeholder="e.g. 54.5"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Processed Bags</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={delivBags}
                      onChangeText={setDelivBags}
                      placeholder="e.g. 2"
                    />
                  </View>
                </View>

                <View style={styles.weightRefBox}>
                  <Text style={styles.weightRefText}>
                    Arrival Wet Weight: <Text style={{ fontWeight: "700" }}>{selectedAggregates.totalWet.toFixed(1)} kg</Text>
                    {numDry > 0 && selectedAggregates.totalWet > 0 ? (
                      <Text style={{ color: colors.primary, fontWeight: "700" }}>
                        {" "}• Yield: {((numDry / selectedAggregates.totalWet) * 100).toFixed(1)}%
                      </Text>
                    ) : null}
                  </Text>
                </View>
              </View>

              {/* Pricing & Billing with Total Arrival KG */}
              <View style={styles.formSection}>
                <Text style={styles.sectionHeader}>2. Drying Charges & Rate</Text>

                {/* 3-Column Breakdown: Total Arrival (Wet), Rate / kg, Calculated Bill */}
                <View style={styles.threeCol}>
                  <View style={{ flex: 1.1 }}>
                    <Text style={styles.inputLabel}>Total Arrival (Wet)</Text>
                    <View style={styles.arrivalBox}>
                      <MaterialCommunityIcons name="scale" size={16} color="#065F46" />
                      <Text style={styles.arrivalBoxText}>
                        {selectedAggregates.totalWet.toFixed(1)} <Text style={{ fontSize: 11, fontWeight: "600" }}>kg</Text>
                      </Text>
                    </View>
                  </View>

                  <View style={{ flex: 0.9 }}>
                    <Text style={styles.inputLabel}>Rate / kg (₹)</Text>
                    <TextInput
                      style={styles.rateInput}
                      keyboardType="numeric"
                      value={delivRate}
                      onChangeText={setDelivRate}
                      placeholder="12"
                    />
                  </View>

                  <View style={{ flex: 1.2 }}>
                    <Text style={styles.inputLabel}>Calculated Bill</Text>
                    <View style={styles.calcBillBox}>
                      <Text style={styles.calcBillText}>₹{totalBillAmount.toLocaleString("en-IN")}</Text>
                    </View>
                  </View>
                </View>

                {/* Formula Equation Bar */}
                <View style={styles.formulaBar}>
                  <MaterialCommunityIcons name="calculator-variant" size={15} color="#047857" />
                  <Text style={styles.formulaText}>
                    {selectedAggregates.totalWet.toFixed(1)} kg arrival × ₹{numRate || 0}/kg = ₹{totalBillAmount.toLocaleString("en-IN")}
                  </Text>
                </View>
              </View>

              {/* Payment Section - Optional / Credit Allowed */}
              <View style={styles.formSection}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={styles.sectionHeader}>3. Payment Collection</Text>
                  <Text style={styles.optionalTag}>Optional / Credit Allowed</Text>
                </View>

                <Text style={styles.inputLabel}>Amount Received (₹) (Leave 0 for Credit)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={delivAmountReceived}
                  onChangeText={setDelivAmountReceived}
                  placeholder="0 (or partial payment)"
                />

                {/* Quick Fill Buttons */}
                <View style={styles.quickFillRow}>
                  <TouchableOpacity
                    style={[styles.quickFillBtn, numReceived === 0 && styles.quickFillBtnActive]}
                    onPress={() => { setDelivAmountReceived("0"); setDelivPaymentMode("Credit"); }}
                  >
                    <Text style={[styles.quickFillText, numReceived === 0 && styles.quickFillTextActive]}>
                      ₹0 (Full Credit)
                    </Text>
                  </TouchableOpacity>

                  {totalBillAmount > 0 && (
                    <>
                      <TouchableOpacity
                        style={styles.quickFillBtn}
                        onPress={() => setDelivAmountReceived(String(Math.round(totalBillAmount / 2)))}
                      >
                        <Text style={styles.quickFillText}>50% (₹{Math.round(totalBillAmount / 2)})</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.quickFillBtn, numReceived === totalBillAmount && styles.quickFillBtnActive]}
                        onPress={() => setDelivAmountReceived(String(totalBillAmount))}
                      >
                        <Text style={[styles.quickFillText, numReceived === totalBillAmount && styles.quickFillTextActive]}>
                          Full (₹{totalBillAmount})
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>

                {/* Payment Mode Pills */}
                <Text style={[styles.inputLabel, { marginTop: spacing.sm }]}>Payment Mode</Text>
                <View style={styles.modeRow}>
                  {PAYMENT_MODES.map(m => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.modePill, delivPaymentMode === m && styles.modePillActive]}
                      onPress={() => setDelivPaymentMode(m)}
                    >
                      <Text style={[styles.modePillText, delivPaymentMode === m && styles.modePillTextActive]}>
                        {m}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Financial Status Summary Notice */}
                <View style={[styles.noticeBox, numReceived === 0 ? styles.noticeBoxCredit : styles.noticeBoxPaid]}>
                  <MaterialCommunityIcons
                    name={numReceived === 0 ? "information-outline" : "check-circle-outline"}
                    size={18}
                    color={numReceived === 0 ? "#B45309" : "#15803D"}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.noticeText, { color: numReceived === 0 ? "#B45309" : "#15803D" }]}>
                      {numReceived === 0
                        ? `Delivery recorded without payment. Full bill of ₹${totalBillAmount.toLocaleString("en-IN")} will be captured as Pending Customer Balance (Credit).`
                        : numReceived < totalBillAmount
                        ? `Partial payment of ₹${numReceived.toLocaleString("en-IN")} received. Remaining ₹${pendingBalance.toLocaleString("en-IN")} recorded as Pending Balance.`
                        : `Full payment of ₹${numReceived.toLocaleString("en-IN")} collected.`}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Receiver Info */}
              <View style={styles.formSection}>
                <Text style={styles.sectionHeader}>4. Delivered To</Text>
                <View style={styles.twoCol}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Received By Name *</Text>
                    <TextInput
                      style={styles.input}
                      value={delivReceivedBy}
                      onChangeText={setDelivReceivedBy}
                      placeholder="Receiver name"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Phone (WhatsApp)</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="phone-pad"
                      value={delivReceivedPhone}
                      onChangeText={setDelivReceivedPhone}
                      placeholder="Mobile number"
                    />
                  </View>
                </View>

                <Text style={[styles.inputLabel, { marginTop: spacing.sm }]}>Delivery Date</Text>
                <TextInput
                  style={styles.input}
                  value={delivDate}
                  onChangeText={setDelivDate}
                  placeholder="YYYY-MM-DD"
                />

                <Text style={[styles.inputLabel, { marginTop: spacing.sm }]}>Remarks / Notes</Text>
                <TextInput
                  style={styles.input}
                  value={delivRemarks}
                  onChangeText={setDelivRemarks}
                  placeholder="Any delivery notes..."
                />
              </View>

              {/* Submit Buttons */}
              <TouchableOpacity
                style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
                disabled={submitting}
                onPress={handleConfirmDelivery}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="truck-delivery" size={20} color="#fff" />
                    <Text style={styles.submitBtnText}>
                      Confirm Delivery & Send WhatsApp
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  search: { flex: 1, paddingVertical: 10, fontSize: 14, color: colors.text },
  summaryBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: colors.card,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryCol: { alignItems: "center" },
  summaryLabel: { fontSize: 10, color: colors.textMuted, fontWeight: "600" },
  summaryVal: { fontSize: 14, fontWeight: "800", color: colors.primary, marginTop: 1 },
  summaryDivider: { width: 1, height: 24, backgroundColor: colors.border },

  customerCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  customerHeader: {
    flexDirection: "row",
    padding: spacing.md,
    gap: spacing.md,
  },
  avatarWrap: { alignItems: "center", minWidth: 44 },
  avatarText: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary50,
    color: colors.primary,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 44,
  },
  codeTag: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    backgroundColor: colors.accent + "20",
    borderRadius: 4,
    marginTop: 4,
  },
  codeTagText: { fontSize: 9.5, fontWeight: "800", color: colors.accent },
  nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  customerName: { fontSize: 15, fontWeight: "800", color: colors.text, flex: 1 },
  readyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F0FDF4",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  readyBadgeText: { fontSize: 11, fontWeight: "800", color: "#15803D" },
  subInfoRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  phoneText: { fontSize: 11.5, color: colors.textLight },
  branchText: { fontSize: 11.5, color: colors.primary, fontWeight: "600" },

  metricsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    marginTop: 8,
  },
  metricItem: { flex: 1, alignItems: "center" },
  metricLabel: { fontSize: 9.5, color: colors.textMuted, fontWeight: "600" },
  metricVal: { fontSize: 12, fontWeight: "800", color: colors.text, marginTop: 1 },
  metricDivider: { width: 1, height: 20, backgroundColor: colors.border },

  drilldownWrap: {
    backgroundColor: "#F9FAFB",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.sm,
    gap: 6,
  },
  drilldownHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  drilldownTitle: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  selectAllBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  selectAllText: { fontSize: 12, fontWeight: "700", color: colors.primary },

  batchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  batchRowSelected: {
    borderColor: colors.primary,
    backgroundColor: "#F0FDF4",
  },
  checkboxWrap: { padding: 2 },
  batchTopRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  batchNo: { fontSize: 13, fontWeight: "800", color: colors.text },
  dateTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  dateTagText: { fontSize: 10, fontWeight: "700", color: "#374151" },
  batchStatsRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  batchStat: { fontSize: 11 },
  statLabel: { color: colors.textMuted },
  statVal: { fontWeight: "700", color: colors.text },
  statDot: { color: colors.textLight, fontSize: 10 },
  singleDeliverIconBtn: { padding: 4 },

  floatingActionBar: {
    position: "absolute",
    bottom: 20,
    left: spacing.md,
    right: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.primary,
    ...shadow.card,
    elevation: 8,
  },
  floatingLeft: { flex: 1 },
  floatingBadge: {
    backgroundColor: colors.primary50,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  floatingBadgeText: { fontSize: 12, fontWeight: "800", color: colors.primary },
  floatingSub: { fontSize: 11, color: colors.textMuted, marginTop: 3 },
  floatingBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radius.lg,
  },
  floatingBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "92%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  modalSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  modalCloseBtn: { padding: 6 },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  lotChip: {
    backgroundColor: colors.primary50,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  lotChipText: { fontSize: 11, fontWeight: "700", color: colors.primary },

  lotChipBig: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderWidth: 1.5,
    borderColor: "#86EFAC",
    borderRadius: radius.lg,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
    ...shadow.sm,
  },
  lotChipContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  lotChipBatchNo: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: 0.3,
  },
  lotChipWeightBadge: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  lotChipWeightText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#166534",
  },
  lotChipRemoveBtn: {
    marginLeft: 2,
    padding: 2,
    alignItems: "center",
    justifyContent: "center",
  },

  formSection: {
    backgroundColor: "#F9FAFB",
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  sectionHeader: { fontSize: 13, fontWeight: "800", color: colors.text },
  optionalTag: { fontSize: 11, color: colors.textMuted, fontWeight: "600" },
  twoCol: { flexDirection: "row", gap: spacing.md },
  threeCol: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  arrivalBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ECFDF5",
    borderWidth: 1.5,
    borderColor: "#A7F3D0",
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 9,
    minHeight: 42,
  },
  arrivalBoxText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#065F46",
  },
  rateInput: {
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
    minHeight: 42,
  },
  formulaBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ECFDF5",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginTop: 4,
  },
  formulaText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#047857",
  },
  inputLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted, marginBottom: 4 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
  },
  weightRefBox: {
    backgroundColor: "#ECFDF5",
    padding: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    marginTop: 4,
  },
  weightRefText: { fontSize: 11.5, color: "#065F46" },
  calcBillBox: {
    backgroundColor: colors.primary50,
    borderWidth: 1,
    borderColor: colors.primary + "40",
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  calcBillText: { fontSize: 16, fontWeight: "800", color: colors.primary },

  quickFillRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  quickFillBtn: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 4,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    alignItems: "center",
  },
  quickFillBtnActive: {
    backgroundColor: colors.primary50,
    borderColor: colors.primary,
  },
  quickFillText: { fontSize: 11, fontWeight: "700", color: colors.textMuted },
  quickFillTextActive: { color: colors.primary },

  modeRow: { flexDirection: "row", gap: 8 },
  modePill: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    alignItems: "center",
  },
  modePillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modePillText: { fontSize: 12, fontWeight: "700", color: colors.text },
  modePillTextActive: { color: "#fff" },

  noticeBox: {
    flexDirection: "row",
    gap: 8,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    marginTop: 4,
  },
  noticeBoxCredit: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  noticeBoxPaid: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
  },
  noticeText: { fontSize: 11.5, lineHeight: 16, fontWeight: "600" },

  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 14,
    marginTop: 8,
    marginBottom: 20,
    ...shadow.card,
  },
  submitBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },

  loaderWrap: { paddingTop: 80, alignItems: "center", justifyContent: "center" },
  loaderTitle: { fontSize: 16, fontWeight: "800", color: colors.text, marginTop: 12 },
  loaderSub: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 6 },
  emptyText: { fontSize: 14, color: colors.textMuted, fontWeight: "600", marginTop: 8, textAlign: "center" },
});
