import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import Calendar from "@/src/components/Calendar";
import { colors, radius, shadow, spacing } from "@/src/theme";

type Machine = {
  id: string;
  name: string;
  capacity: number;
  status: string;
  is_outsourced?: boolean;
  vendor_name?: string;
  vendor_phone?: string;
  vendor_rate_per_kg?: number;
};

type Batch = {
  id: string;
  batch_no: string;
  receipt_no?: string;
  raw_weight: number;
  bags: number;
  customer?: { id: string; name: string; code?: string; mobile?: string };
  product?: { name: string };
  machine?: { id: string; name: string };
  machine_name?: string;
  status: string;
  created_at?: string;
  arrival_date?: string;
  remarks?: string;
};

function todayISOStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateTime(d: Date) {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  
  let hours = d.getHours();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  const min = String(d.getMinutes()).padStart(2, "0");
  
  return `${day}/${month}/${year}, ${String(hours).padStart(2, "0")}:${min} ${ampm}`;
}

export default function BatchingForm() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { selectedBranchId } = useAuth();

  const [activeTab, setActiveTab] = useState<"start" | "running">(
    params.tab === "running" ? "running" : "start"
  );

  const [machines, setMachines] = useState<Machine[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [runningBatches, setRunningBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedMachineId, setSelectedMachineId] = useState("");
  const [selectedBatchIds, setSelectedBatchIds] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [machineFilter, setMachineFilter] = useState<"All" | "In-House" | "Outsourced">("All");

  // Complete Processing Modal State
  const [completeBatch, setCompleteBatch] = useState<Batch | null>(null);
  const [compDryWeight, setCompDryWeight] = useState("");
  const [compPadiWeight, setCompPadiWeight] = useState("");
  const [compBags, setCompBags] = useState("");
  const [completing, setCompleting] = useState(false);

  const inhouseMachines = React.useMemo(() => machines.filter(m => !m.is_outsourced), [machines]);
  const outsourcedMachines = React.useMemo(() => machines.filter(m => !!m.is_outsourced), [machines]);
  const selectedMachine = React.useMemo(() => machines.find(m => m.id === selectedMachineId), [machines, selectedMachineId]);

  // Date and Time picker states
  const [processTime, setProcessTime] = useState(new Date());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [tempDateStr, setTempDateStr] = useState(todayISOStr(new Date()));
  const [tempHour, setTempHour] = useState(12);
  const [tempMinute, setTempMinute] = useState(0);
  const [tempAmPm, setTempAmPm] = useState<"AM" | "PM">("AM");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const branchParam = selectedBranchId ? `?branch_id=${selectedBranchId}` : "";
      const machs = await api<Machine[]>(`/machines${branchParam}`);
      setMachines(machs.filter(m => m.status === "Available"));

      const pendingUrl = selectedBranchId 
        ? `/batches?status=Received&branch_id=${selectedBranchId}` 
        : "/batches?status=Received";
      const dryingUrl = selectedBranchId 
        ? `/batches?status=Drying&branch_id=${selectedBranchId}` 
        : "/batches?status=Drying";
      const loadedUrl = selectedBranchId 
        ? `/batches?status=Loaded&branch_id=${selectedBranchId}` 
        : "/batches?status=Loaded";

      const [pendingList, dryingList, loadedList] = await Promise.all([
        api<Batch[]>(pendingUrl),
        api<Batch[]>(dryingUrl).catch(() => [] as Batch[]),
        api<Batch[]>(loadedUrl).catch(() => [] as Batch[]),
      ]);

      setBatches(pendingList);

      // Deduplicate running batches by ID
      const rMap = new Map<string, Batch>();
      [...dryingList, ...loadedList].forEach(b => rMap.set(b.id, b));
      setRunningBatches(Array.from(rMap.values()));
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to load branch data");
    } finally {
      setLoading(false);
    }
  }, [selectedBranchId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const toggleBatchSelect = (id: string) => {
    setSelectedBatchIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const openDateTimePicker = () => {
    setTempDateStr(todayISOStr(processTime));
    let hr = processTime.getHours();
    const ampm = hr >= 12 ? "PM" : "AM";
    hr = hr % 12;
    hr = hr ? hr : 12;
    setTempHour(hr);
    setTempMinute(Math.round(processTime.getMinutes() / 5) * 5 % 60);
    setTempAmPm(ampm);
    setDatePickerOpen(true);
  };

  const incrementHour = (amount: number) => {
    setTempHour(prev => {
      let val = prev + amount;
      if (val > 12) return 1;
      if (val < 1) return 12;
      return val;
    });
  };

  const incrementMinute = (amount: number) => {
    setTempMinute(prev => {
      let val = prev + amount;
      if (val >= 60) return 0;
      if (val < 0) return 55;
      return val;
    });
  };

  const saveDateTime = () => {
    const [y, m, d] = tempDateStr.split("-").map(Number);
    let hr = tempHour;
    if (tempAmPm === "PM" && hr < 12) hr += 12;
    if (tempAmPm === "AM" && hr === 12) hr = 0;
    const newDate = new Date(y, m - 1, d, hr, tempMinute);
    setProcessTime(newDate);
    setDatePickerOpen(false);
  };

  const handleStartProcess = async () => {
    if (!selectedMachineId) {
      Alert.alert("Input Required", "Please select a dryer machine to run.");
      return;
    }

    const ids = Object.keys(selectedBatchIds).filter(id => selectedBatchIds[id]);
    if (ids.length === 0) {
      Alert.alert("Selection Required", "Please select at least one customer arrival stock to process.");
      return;
    }

    setSaving(true);
    try {
      await api(`/machines/${selectedMachineId}/load`, {
        method: "POST",
        body: { batch_ids: ids, start_time: processTime.toISOString() }
      });
      Alert.alert("Success", "Dryer loaded and process started successfully.");
      setSelectedBatchIds({});
      setSelectedMachineId("");
      await loadData();
      setActiveTab("running");
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to launch process");
    } finally {
      setSaving(false);
    }
  };

  const openCompleteModal = (b: Batch) => {
    setCompleteBatch(b);
    setCompDryWeight("");
    setCompPadiWeight("");
    setCompBags("");
  };

  const handleCompleteSubmit = async () => {
    if (!completeBatch) return;
    const dry = parseFloat(compDryWeight);
    if (!dry || dry <= 0) {
      Alert.alert("Invalid Weight", "Please enter a valid processed dry weight.");
      return;
    }
    const padi = parseFloat(compPadiWeight || "0");
    const dryBags = parseInt(compBags || "0", 10);
    setCompleting(true);
    try {
      await api(`/batches/${completeBatch.id}/status`, {
        method: "PUT",
        body: {
          status: "Completed",
          actual_dry_weight: dry,
          padi_weight: padi,
          processed_bags: dryBags,
        }
      });
      Alert.alert("Processing Completed", `Batch ${completeBatch.batch_no} marked Completed & ready for dispatch! Customer notification dispatched.`);
      setCompleteBatch(null);
      await loadData();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to complete processing");
    } finally {
      setCompleting(false);
    }
  };

  const totalRawWeight = batches
    .filter(b => selectedBatchIds[b.id])
    .reduce((sum, b) => sum + (b.raw_weight || 0), 0);

  const selectedCount = Object.keys(selectedBatchIds).filter(id => selectedBatchIds[id]).length;

  const renderMachineItem = (m: Machine) => {
    const isSelected = selectedMachineId === m.id;
    const isOut = !!m.is_outsourced;
    return (
      <TouchableOpacity
        key={m.id}
        style={[
          styles.machineCard,
          isOut && styles.machineCardOutsourced,
          isSelected && (isOut ? styles.machineCardOutsourcedSelected : styles.machineCardSelected),
        ]}
        onPress={() => setSelectedMachineId(m.id)}
        activeOpacity={0.9}
      >
        <View
          style={[
            styles.machineIconBox,
            { backgroundColor: isSelected ? (isOut ? "#FFE082" : colors.primary50) : (isOut ? "#FFF8E1" : "#f5f5f5") },
          ]}
        >
          <MaterialCommunityIcons
            name={isOut ? "truck-delivery-outline" : "generator-portable"}
            size={22}
            color={isSelected ? (isOut ? "#E65100" : colors.primary) : (isOut ? "#E65100" : colors.textMuted)}
          />
        </View>
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={[styles.machineName, isSelected && (isOut ? { color: "#E65100" } : styles.machineNameSelected)]}>
              {m.name}
            </Text>
            <View style={[styles.miniBadge, isOut ? styles.miniBadgeOutsourced : styles.miniBadgeInhouse]}>
              <Text style={[styles.miniBadgeText, isOut ? styles.miniBadgeTextOutsourced : styles.miniBadgeTextInhouse]}>
                {isOut ? "Vendor" : "In-House"}
              </Text>
            </View>
          </View>

          {isOut && m.vendor_name ? (
            <Text style={styles.vendorNameSubtext} numberOfLines={1}>
              <MaterialCommunityIcons name="office-building" size={11} color="#E65100" /> {m.vendor_name}
            </Text>
          ) : null}

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
            <Text style={styles.machineCap}>Capacity: {m.capacity} KG</Text>
            {isOut && m.vendor_rate_per_kg ? (
              <Text style={styles.vendorRateSubtext}>• Rate: ₹{m.vendor_rate_per_kg}/KG</Text>
            ) : null}
          </View>
        </View>
        {isSelected && (
          <MaterialCommunityIcons
            name="check-circle"
            size={22}
            color={isOut ? "#E65100" : colors.primary}
          />
        )}
      </TouchableOpacity>
    );
  };

  const renderRunningBatchCard = (b: Batch) => {
    const machineName = b.machine?.name || b.machine_name || "Dryer";
    return (
      <View key={b.id} style={styles.runningCard}>
        {/* Card Header: Machine Badge + Batch No + Product */}
        <View style={styles.runningCardHeader}>
          <View style={styles.runningMachinePill}>
            <View style={styles.runningDot} />
            <Text style={styles.runningMachineText}>{machineName}</Text>
          </View>

          <View style={styles.runningBatchPill}>
            <Text style={styles.runningBatchText}>{b.batch_no}</Text>
          </View>

          {b.product?.name ? (
            <View style={styles.runningProductChip}>
              <Text style={styles.runningProductText}>{b.product.name}</Text>
            </View>
          ) : null}
        </View>

        {/* Customer Information */}
        <View style={styles.runningCustomerRow}>
          <View style={styles.runningAvatar}>
            <Text style={styles.runningAvatarText}>
              {(b.customer?.name || "C").charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.runningCustomerName}>{b.customer?.name || "Unknown Customer"}</Text>
            {b.customer?.mobile ? (
              <Text style={styles.runningCustomerPhone}>{b.customer.mobile}</Text>
            ) : null}
          </View>
        </View>

        {/* Weight & Bags Stats Row */}
        <View style={styles.runningStatsGrid}>
          <View style={styles.runningStatBox}>
            <Text style={styles.runningStatLabel}>ARRIVAL WEIGHT</Text>
            <Text style={styles.runningStatVal}>{b.raw_weight} kg</Text>
          </View>
          <View style={styles.runningStatBox}>
            <Text style={styles.runningStatLabel}>BAGS</Text>
            <Text style={styles.runningStatVal}>{b.bags || 1} Bags</Text>
          </View>
          <View style={styles.runningStatBox}>
            <Text style={styles.runningStatLabel}>STATUS</Text>
            <Text style={[styles.runningStatVal, { color: colors.warning }]}>Drying</Text>
          </View>
        </View>

        {/* Loaded Info / Remarks */}
        {b.remarks ? (
          <View style={styles.runningRemarksRow}>
            <MaterialCommunityIcons name="information-outline" size={13} color={colors.textMuted} />
            <Text style={styles.runningRemarksText} numberOfLines={1}>{b.remarks}</Text>
          </View>
        ) : null}

        {/* Action Button: One-tap Complete Processing */}
        <TouchableOpacity
          style={styles.completeActionBtn}
          onPress={() => openCompleteModal(b)}
          activeOpacity={0.88}
        >
          <MaterialCommunityIcons name="check-circle-outline" size={18} color="#FFFFFF" />
          <Text style={styles.completeActionBtnText}>Complete Processing</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dryer Processing</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Top Segment Tabs: Start Drying vs Running Batches */}
      <View style={styles.topTabsContainer}>
        <TouchableOpacity
          style={[styles.topTabBtn, activeTab === "start" && styles.topTabBtnActive]}
          onPress={() => setActiveTab("start")}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons
            name="play-circle-outline"
            size={16}
            color={activeTab === "start" ? "#FFFFFF" : colors.textMuted}
          />
          <Text style={[styles.topTabText, activeTab === "start" && styles.topTabTextActive]}>
            Start Drying
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.topTabBtn, activeTab === "running" && styles.topTabBtnActiveRunning]}
          onPress={() => setActiveTab("running")}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons
            name="cog-play"
            size={16}
            color={activeTab === "running" ? "#FFFFFF" : colors.warning}
          />
          <Text style={[styles.topTabText, activeTab === "running" && styles.topTabTextActive]}>
            Running Batches
          </Text>
          {runningBatches.length > 0 && (
            <View style={[styles.runningBadgePill, activeTab === "running" && styles.runningBadgePillActive]}>
              <Text style={[styles.runningBadgePillText, activeTab === "running" && styles.runningBadgePillTextActive]}>
                {runningBatches.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Fetching branch processing data...</Text>
        </View>
      ) : activeTab === "running" ? (
        /* TAB 2: RUNNING BATCHES LIST */
        <ScrollView contentContainerStyle={styles.runningScroll} showsVerticalScrollIndicator={false}>
          {runningBatches.length === 0 ? (
            <View style={styles.emptyRunningCard}>
              <View style={styles.emptyIconCircle}>
                <MaterialCommunityIcons name="check-all" size={36} color={colors.primary} />
              </View>
              <Text style={styles.emptyRunningTitle}>No Batches Currently Drying</Text>
              <Text style={styles.emptyRunningSub}>
                All dryers are idle. Select pending arrivals in "Start Drying" to launch a new batch run.
              </Text>
              <TouchableOpacity
                style={styles.emptyActionBtn}
                onPress={() => setActiveTab("start")}
              >
                <MaterialCommunityIcons name="plus" size={16} color="#FFFFFF" />
                <Text style={styles.emptyActionBtnText}>Start New Dryer Run</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.runningListSummary}>
                <Text style={styles.runningSummaryTitle}>
                  {runningBatches.length} BATCH{runningBatches.length > 1 ? "ES" : ""} IN DRYERS
                </Text>
                <Text style={styles.runningSummarySub}>
                  Record output weights to complete drying and notify customer
                </Text>
              </View>

              <View style={{ gap: spacing.md }}>
                {runningBatches.map(renderRunningBatchCard)}
              </View>
            </>
          )}
        </ScrollView>
      ) : (
        /* TAB 1: START DRYING (NEW BATCH RUN) */
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Quick Banner if running batches exist */}
            {runningBatches.length > 0 && (
              <TouchableOpacity
                style={styles.runningAlertBanner}
                onPress={() => setActiveTab("running")}
                activeOpacity={0.88}
              >
                <View style={styles.alertPulseDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.alertBannerTitle}>
                    {runningBatches.length} Batch{runningBatches.length > 1 ? "es" : ""} Currently In Dryers
                  </Text>
                  <Text style={styles.alertBannerSub}>
                    Tap to view running batches & complete processing
                  </Text>
                </View>
                <MaterialCommunityIcons name="arrow-right" size={18} color="#B45309" />
              </TouchableOpacity>
            )}

            {/* 1. MACHINE SELECTOR */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs }}>
              <Text style={styles.sectionTitle}>1. Select Dryer Machine</Text>
              {selectedMachine && (
                <View style={[styles.selectedPill, selectedMachine.is_outsourced ? styles.selectedPillOutsourced : styles.selectedPillInhouse]}>
                  <Text style={[styles.selectedPillText, selectedMachine.is_outsourced ? { color: "#E65100" } : { color: colors.primary }]}>
                    {selectedMachine.is_outsourced ? "Vendor Dryer" : "In-House Dryer"}
                  </Text>
                </View>
              )}
            </View>

            {/* Quick Segment Filter: All vs In-House vs Vendor */}
            {machines.length > 0 && (
              <View style={styles.segmentRow}>
                <TouchableOpacity
                  style={[styles.segmentTab, machineFilter === "All" && styles.segmentTabActive]}
                  onPress={() => setMachineFilter("All")}
                >
                  <Text style={[styles.segmentTabText, machineFilter === "All" && styles.segmentTabTextActive]}>
                    All ({machines.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.segmentTab, machineFilter === "In-House" && styles.segmentTabActiveInhouse]}
                  onPress={() => setMachineFilter("In-House")}
                >
                  <MaterialCommunityIcons name="factory" size={13} color={machineFilter === "In-House" ? "#fff" : colors.primary} />
                  <Text style={[styles.segmentTabText, machineFilter === "In-House" && styles.segmentTabTextActiveWhite]}>
                    In-House ({inhouseMachines.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.segmentTab, machineFilter === "Outsourced" && styles.segmentTabActiveOutsourced]}
                  onPress={() => setMachineFilter("Outsourced")}
                >
                  <MaterialCommunityIcons name="truck-delivery-outline" size={13} color={machineFilter === "Outsourced" ? "#fff" : "#E65100"} />
                  <Text style={[styles.segmentTabText, machineFilter === "Outsourced" && styles.segmentTabTextActiveWhite]}>
                    Vendor ({outsourcedMachines.length})
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {machines.length === 0 ? (
              <View style={styles.warnBox}>
                <MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.danger} />
                <Text style={styles.warnText}>No available dryers found at this branch. Complete running batches to free up dryers.</Text>
              </View>
            ) : (
              <View style={{ gap: spacing.md }}>
                {/* In-House Group */}
                {(machineFilter === "All" || machineFilter === "In-House") && inhouseMachines.length > 0 && (
                  <View style={styles.subGroupContainer}>
                    <View style={styles.subGroupHeader}>
                      <MaterialCommunityIcons name="factory" size={15} color={colors.primary} />
                      <Text style={styles.subGroupTitle}>IN-HOUSE DRYERS</Text>
                      <View style={styles.subGroupPill}>
                        <Text style={styles.subGroupPillText}>{inhouseMachines.length} Available</Text>
                      </View>
                    </View>
                    <View style={styles.machineList}>
                      {inhouseMachines.map(renderMachineItem)}
                    </View>
                  </View>
                )}

                {/* Outsourced Group */}
                {(machineFilter === "All" || machineFilter === "Outsourced") && (
                  <View style={styles.subGroupContainer}>
                    <View style={[styles.subGroupHeader, styles.subGroupHeaderOutsourced]}>
                      <MaterialCommunityIcons name="truck-delivery-outline" size={15} color="#E65100" />
                      <Text style={[styles.subGroupTitle, { color: "#E65100" }]}>VENDOR / OUTSOURCED DRYERS</Text>
                      <View style={[styles.subGroupPill, { backgroundColor: "#FFE082" }]}>
                        <Text style={[styles.subGroupPillText, { color: "#E65100" }]}>{outsourcedMachines.length} Available</Text>
                      </View>
                    </View>
                    {outsourcedMachines.length > 0 ? (
                      <View style={styles.machineList}>
                        {outsourcedMachines.map(renderMachineItem)}
                      </View>
                    ) : (
                      <View style={styles.vendorEmptyBox}>
                        <Text style={styles.vendorEmptyText}>No available outsourced vendor dryers at this branch.</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* 2. DATE TIME SELECTOR */}
            <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>2. Select Process Start Time</Text>
            <TouchableOpacity
              style={styles.dateTimeField}
              onPress={openDateTimePicker}
              activeOpacity={0.9}
            >
              <View style={styles.dateTimeIconBox}>
                <MaterialCommunityIcons name="clock-outline" size={20} color={colors.primary} />
              </View>
              <Text style={styles.dateTimeText}>{formatDateTime(processTime)}</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
            </TouchableOpacity>

            {/* 3. ARRIVALS SELECTOR */}
            <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>3. Select Arrivals ({batches.length} pending)</Text>
            {batches.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="package-variant" size={40} color={colors.textMuted} />
                <Text style={styles.emptyText}>No pending arrivals at this branch.</Text>
              </View>
            ) : (
              batches.map(b => {
                const isSelected = !!selectedBatchIds[b.id];
                return (
                  <TouchableOpacity
                    key={b.id}
                    style={[styles.arrivalCard, isSelected && styles.arrivalCardSelected]}
                    onPress={() => toggleBatchSelect(b.id)}
                    activeOpacity={0.9}
                  >
                    <View style={styles.arrivalCardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.customerName}>{b.customer?.name || "Unknown Customer"}</Text>
                        <Text style={styles.batchNo}>{b.batch_no} • {b.product?.name || "N/A"}</Text>
                      </View>
                      <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                        {isSelected && <MaterialCommunityIcons name="check" size={16} color="#fff" />}
                      </View>
                    </View>
                    <View style={styles.arrivalDivider} />
                    <View style={styles.arrivalMeta}>
                      <Text style={styles.metaLabel}>Raw: <Text style={styles.metaVal}>{b.raw_weight} KG</Text></Text>
                      <Text style={styles.metaLabel}>Bags: <Text style={styles.metaVal}>{b.bags} Bags</Text></Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}

          </ScrollView>

          {/* CONFIRM ACTION BAR */}
          <View style={styles.buttonBar}>
            <View style={styles.summaryInfo}>
              <Text style={styles.summaryLabel}>Selected: {selectedCount} arrivals</Text>
              <Text style={styles.summaryVal}>Weight: {totalRawWeight.toFixed(2)} KG</Text>
            </View>
            <TouchableOpacity
              style={[styles.actionBtn, (saving || !selectedMachineId || selectedCount === 0) && styles.actionBtnDisabled]}
              onPress={handleStartProcess}
              disabled={saving || !selectedMachineId || selectedCount === 0}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <MaterialCommunityIcons name="play-circle" size={20} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.actionBtnText}>Start Drying</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

        </View>
      )}

      {/* DateTime Picker Modal */}
      <Modal
        visible={datePickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setDatePickerOpen(false)}
      >
        <View style={styles.dateModalBg}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerSheetHandle} />
            <Text style={styles.pickerSheetTitle}>Select Process Start Time</Text>

            <Calendar
              startDate={tempDateStr}
              endDate={tempDateStr}
              onSelectRange={(s) => {
                setTempDateStr(s);
              }}
            />

            <Text style={styles.timeSectionTitle}>Time</Text>
            <View style={styles.timePickerRow}>
              <View style={styles.timeCol}>
                <TouchableOpacity onPress={() => incrementHour(-1)} style={styles.timeBtn}>
                  <MaterialCommunityIcons name="minus" size={16} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.timeValue}>{String(tempHour).padStart(2, "0")}</Text>
                <TouchableOpacity onPress={() => incrementHour(1)} style={styles.timeBtn}>
                  <MaterialCommunityIcons name="plus" size={16} color={colors.text} />
                </TouchableOpacity>
              </View>

              <Text style={styles.timeColon}>:</Text>

              <View style={styles.timeCol}>
                <TouchableOpacity onPress={() => incrementMinute(-5)} style={styles.timeBtn}>
                  <MaterialCommunityIcons name="minus" size={16} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.timeValue}>{String(tempMinute).padStart(2, "0")}</Text>
                <TouchableOpacity onPress={() => incrementMinute(5)} style={styles.timeBtn}>
                  <MaterialCommunityIcons name="plus" size={16} color={colors.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.ampmCol}>
                <TouchableOpacity
                  style={[styles.ampmBtn, tempAmPm === "AM" && styles.ampmBtnActive]}
                  onPress={() => setTempAmPm("AM")}
                >
                  <Text style={[styles.ampmText, tempAmPm === "AM" && styles.ampmTextActive]}>AM</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.ampmBtn, tempAmPm === "PM" && styles.ampmBtnActive]}
                  onPress={() => setTempAmPm("PM")}
                >
                  <Text style={[styles.ampmText, tempAmPm === "PM" && styles.ampmTextActive]}>PM</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.pickerSheetActions}>
              <TouchableOpacity style={styles.pickerSheetCancel} onPress={() => setDatePickerOpen(false)}>
                <Text style={styles.pickerSheetCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pickerSheetApply} onPress={saveDateTime}>
                <Text style={styles.pickerSheetApplyText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Complete Processing Modal */}
      <Modal
        visible={!!completeBatch}
        transparent
        animationType="fade"
        onRequestClose={() => setCompleteBatch(null)}
      >
        <View style={styles.modalBg}>
          <View style={styles.completeModalContent}>
            <View style={styles.completeModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.completeModalTitle}>Complete Processing</Text>
                <Text style={styles.completeModalSub}>
                  {completeBatch?.batch_no} • {completeBatch?.customer?.name}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setCompleteBatch(null)}>
                <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Arrival Reference Info */}
            <View style={styles.completeRefBox}>
              <View style={{ flex: 1 }}>
                <Text style={styles.completeRefLabel}>ARRIVAL WET WEIGHT</Text>
                <Text style={styles.completeRefVal}>{completeBatch?.raw_weight || 0} kg</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.completeRefLabel}>ARRIVAL BAGS</Text>
                <Text style={styles.completeRefVal}>{completeBatch?.bags || 0} Bags</Text>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
              <Text style={styles.completeInputLabel}>Processed Dry Weight (KG) *</Text>
              <TextInput
                testID="batching-complete-dry-weight"
                style={styles.completeTextInput}
                value={compDryWeight}
                onChangeText={setCompDryWeight}
                keyboardType="decimal-pad"
                placeholder="e.g. 112.5"
                placeholderTextColor={colors.textLight}
              />

              <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.completeInputLabel}>Padi Weight (KG)</Text>
                  <TextInput
                    testID="batching-complete-padi-weight"
                    style={styles.completeTextInput}
                    value={compPadiWeight}
                    onChangeText={setCompPadiWeight}
                    keyboardType="decimal-pad"
                    placeholder="e.g. 5.2"
                    placeholderTextColor={colors.textLight}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.completeInputLabel}>Dry Bags</Text>
                  <TextInput
                    testID="batching-complete-bags"
                    style={styles.completeTextInput}
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
                <View style={styles.completeCalcBox}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                    <Text style={styles.completeCalcLabel}>Total Output (Dry + Padi):</Text>
                    <Text style={styles.completeCalcVal}>
                      {(parseFloat(compDryWeight || "0") + parseFloat(compPadiWeight || "0")).toFixed(2)} kg
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={styles.completeCalcLabel}>Weight Loss (Moisture):</Text>
                    <Text style={[styles.completeCalcVal, { color: colors.warning }]}>
                      {Math.max(0, (completeBatch?.raw_weight || 0) - (parseFloat(compDryWeight || "0") + parseFloat(compPadiWeight || "0"))).toFixed(2)} kg ({completeBatch && completeBatch.raw_weight > 0 ? (((completeBatch.raw_weight - (parseFloat(compDryWeight || "0") + parseFloat(compPadiWeight || "0"))) / completeBatch.raw_weight) * 100).toFixed(1) : 0}%)
                    </Text>
                  </View>
                </View>
              )}

              <View style={styles.completeNoticeBox}>
                <MaterialCommunityIcons name="whatsapp" size={16} color="#25D366" />
                <Text style={styles.completeNoticeText}>
                  A WhatsApp ready-for-dispatch message with dry & padi weights will be sent immediately to the customer.
                </Text>
              </View>
            </ScrollView>

            <View style={styles.completeActionsRow}>
              <TouchableOpacity
                style={styles.completeCancelBtn}
                onPress={() => setCompleteBatch(null)}
              >
                <Text style={styles.completeCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.completeSubmitBtn}
                onPress={handleCompleteSubmit}
                disabled={completing}
              >
                {completing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.completeSubmitBtnText}>Complete & Notify</Text>
                )}
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: colors.text },

  // Top Segment Tabs
  topTabsContainer: {
    flexDirection: "row",
    backgroundColor: "#fff",
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  topTabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: "#F1F5F9",
  },
  topTabBtnActive: {
    backgroundColor: colors.primary,
  },
  topTabBtnActiveRunning: {
    backgroundColor: "#D97706",
  },
  topTabText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
  },
  topTabTextActive: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  runningBadgePill: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  runningBadgePillActive: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  runningBadgePillText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#B45309",
  },
  runningBadgePillTextActive: {
    color: "#FFFFFF",
  },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  loadingText: { marginTop: spacing.md, color: colors.textMuted, fontSize: 14, fontWeight: "600" },
  scroll: { padding: spacing.lg, paddingBottom: 120 },

  // Running Alert Banner in Start tab
  runningAlertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FEF3C7",
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#FDE68A",
    marginBottom: spacing.lg,
  },
  alertPulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#D97706",
  },
  alertBannerTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#92400E",
  },
  alertBannerSub: {
    fontSize: 11,
    color: "#B45309",
    marginTop: 2,
  },

  // Running Tab Styles
  runningScroll: { padding: spacing.lg, paddingBottom: 60 },
  runningListSummary: {
    marginBottom: spacing.md,
  },
  runningSummaryTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  runningSummarySub: {
    fontSize: 12,
    color: colors.textLight,
    marginTop: 2,
  },
  runningCard: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  runningCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: spacing.sm,
  },
  runningMachinePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  runningDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#2563EB",
  },
  runningMachineText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#1E40AF",
  },
  runningBatchPill: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  runningBatchText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.text,
  },
  runningProductChip: {
    marginLeft: "auto",
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  runningProductText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
  },
  runningCustomerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: spacing.sm,
  },
  runningAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary50,
    alignItems: "center",
    justifyContent: "center",
  },
  runningAvatarText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.primary,
  },
  runningCustomerName: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  runningCustomerPhone: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  runningStatsGrid: {
    flexDirection: "row",
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 6,
    marginBottom: spacing.sm,
  },
  runningStatBox: {
    flex: 1,
  },
  runningStatLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textMuted,
  },
  runningStatVal: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
    marginTop: 2,
  },
  runningRemarksRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: spacing.sm,
  },
  runningRemarksText: {
    fontSize: 11,
    color: colors.textMuted,
    flex: 1,
  },
  completeActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#059669",
    borderRadius: radius.pill,
    paddingVertical: 12,
    marginTop: 4,
    ...shadow.sm,
  },
  completeActionBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },

  // Empty Running Card
  emptyRunningCard: {
    backgroundColor: "#fff",
    borderRadius: radius.xl,
    padding: 30,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xl,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  emptyRunningTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 6,
  },
  emptyRunningSub: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: spacing.lg,
  },
  emptyActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radius.pill,
  },
  emptyActionBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
  },

  // Existing sections
  sectionTitle: { fontSize: 13, fontWeight: "800", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: spacing.md },
  warnBox: {
    flexDirection: "row",
    backgroundColor: "#FFEBEE",
    borderWidth: 1,
    borderColor: "#FFCDD2",
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    gap: spacing.sm,
  },
  warnText: { flex: 1, fontSize: 12, color: colors.danger, fontWeight: "600", lineHeight: 18 },
  emptyState: { paddingVertical: 30, alignItems: "center", justifyContent: "center", backgroundColor: "#fff", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  emptyText: { marginTop: spacing.sm, color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  machineList: { gap: spacing.sm },
  machineCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  machineCardSelected: { borderColor: colors.primary, backgroundColor: "#F1F8E9" },
  machineCardOutsourced: { borderColor: "#FFE082" },
  machineCardOutsourcedSelected: { borderColor: "#E65100", backgroundColor: "#FFF8E1" },
  machineIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  machineName: { fontSize: 15, fontWeight: "700", color: colors.text },
  machineNameSelected: { color: colors.primary, fontWeight: "800" },
  machineCap: { fontSize: 12, color: colors.textMuted },
  miniBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill },
  miniBadgeInhouse: { backgroundColor: "#E8F5E9" },
  miniBadgeOutsourced: { backgroundColor: "#FFF3E0" },
  miniBadgeText: { fontSize: 10, fontWeight: "700" },
  miniBadgeTextInhouse: { color: colors.primary },
  miniBadgeTextOutsourced: { color: "#E65100" },
  vendorNameSubtext: { fontSize: 11, color: "#E65100", fontWeight: "600", marginTop: 1 },
  vendorRateSubtext: { fontSize: 11, color: "#E65100", fontWeight: "700" },
  selectedPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  selectedPillInhouse: { backgroundColor: colors.primary50 },
  selectedPillOutsourced: { backgroundColor: "#FFE082" },
  selectedPillText: { fontSize: 11, fontWeight: "800" },
  segmentRow: { flexDirection: "row", gap: spacing.xs, marginBottom: spacing.md },
  segmentTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: "#f5f5f5",
  },
  segmentTabActive: { backgroundColor: colors.text },
  segmentTabActiveInhouse: { backgroundColor: colors.primary },
  segmentTabActiveOutsourced: { backgroundColor: "#E65100" },
  segmentTabText: { fontSize: 11, fontWeight: "700", color: colors.textMuted },
  segmentTabTextActive: { color: "#fff" },
  segmentTabTextActiveWhite: { color: "#fff" },
  subGroupContainer: { gap: spacing.xs },
  subGroupHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  subGroupHeaderOutsourced: {},
  subGroupTitle: { fontSize: 11, fontWeight: "800", color: colors.primary, letterSpacing: 0.5 },
  subGroupPill: { backgroundColor: colors.primary50, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill },
  subGroupPillText: { fontSize: 10, fontWeight: "800", color: colors.primary },
  vendorEmptyBox: { padding: spacing.md, backgroundColor: "#FFF8E1", borderRadius: radius.md, borderWidth: 1, borderColor: "#FFE082" },
  vendorEmptyText: { fontSize: 12, color: "#E65100", fontWeight: "600" },

  // DateTime Selector
  dateTimeField: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  dateTimeIconBox: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary50, alignItems: "center", justifyContent: "center", marginRight: spacing.sm },
  dateTimeText: { flex: 1, fontSize: 14, fontWeight: "700", color: colors.text },

  // Arrival item card
  arrivalCard: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  arrivalCardSelected: { borderColor: colors.primary, backgroundColor: "#F1F8E9" },
  arrivalCardHeader: { flexDirection: "row", alignItems: "center" },
  customerName: { fontSize: 14, fontWeight: "800", color: colors.text },
  batchNo: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  arrivalDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  arrivalMeta: { flexDirection: "row", gap: spacing.md },
  metaLabel: { fontSize: 12, color: colors.textMuted, fontWeight: "500" },
  metaVal: { fontWeight: "700", color: colors.text },
  buttonBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    ...shadow.card,
  },
  summaryInfo: { flex: 1 },
  summaryLabel: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  summaryVal: { fontSize: 14, fontWeight: "800", color: colors.text, marginTop: 2 },
  actionBtn: {
    flex: 1.2,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  actionBtnDisabled: { opacity: 0.6 },
  actionBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  // DateTime Modal Styles
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
  timeSectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.textMuted,
    textTransform: "uppercase",
    marginTop: spacing.md,
    marginBottom: 6,
    textAlign: "center",
  },
  timePickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  timeCol: {
    alignItems: "center",
    flexDirection: "row",
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 8,
  },
  timeBtn: {
    padding: 6,
  },
  timeValue: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
    minWidth: 24,
    textAlign: "center",
  },
  timeColon: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
  },
  ampmCol: {
    flexDirection: "row",
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  ampmBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  ampmBtnActive: {
    backgroundColor: colors.primary,
  },
  ampmText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.textMuted,
  },
  ampmTextActive: {
    color: "#fff",
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

  // Complete Processing Modal
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  completeModalContent: {
    backgroundColor: "#fff",
    borderRadius: radius.xl,
    padding: spacing.xl,
    maxHeight: "85%",
  },
  completeModalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: spacing.md,
  },
  completeModalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  completeModalSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  completeRefBox: {
    flexDirection: "row",
    backgroundColor: colors.primary50,
    padding: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  completeRefLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 0.5,
  },
  completeRefVal: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
    marginTop: 2,
  },
  completeInputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    marginBottom: 4,
  },
  completeTextInput: {
    backgroundColor: colors.bg,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  completeCalcBox: {
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: radius.md,
    padding: 10,
    marginTop: spacing.md,
  },
  completeCalcLabel: {
    fontSize: 12,
    color: "#92400E",
    fontWeight: "600",
  },
  completeCalcVal: {
    fontSize: 12,
    fontWeight: "800",
    color: "#78350F",
  },
  completeNoticeBox: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#F0FDF4",
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    marginTop: spacing.md,
    alignItems: "center",
  },
  completeNoticeText: {
    flex: 1,
    fontSize: 11,
    color: "#166534",
    lineHeight: 16,
    fontWeight: "600",
  },
  completeActionsRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  completeCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
  },
  completeCancelBtnText: {
    color: colors.textMuted,
    fontWeight: "700",
  },
  completeSubmitBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: "#059669",
    alignItems: "center",
    justifyContent: "center",
  },
  completeSubmitBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
});
