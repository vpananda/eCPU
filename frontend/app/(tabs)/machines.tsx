import React, { useCallback, useMemo, useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Modal, Animated, Easing, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useSync, useSyncRefresh } from "@/src/sync";
import Loader from "@/src/components/Loader";
import { colors, radius, shadow, spacing } from "@/src/theme";

type Machine = {
  id: string; name: string; capacity: number; status: string; branch_name?: string;
  is_outsourced?: boolean; vendor_name?: string; vendor_phone?: string; vendor_rate_per_kg?: number;
  current_batch?: { id: string; batch_no: string; customer_name: string; expected_delivery_date?: string; status: string };
};

const STATUSES = ["All", "Available", "Running", "Maintenance", "Cleaning"];
const SOURCE_TABS = ["All", "In-House", "Vendor"] as const;
type SourceTab = typeof SOURCE_TABS[number];

const getStatusMeta = (status: string) => {
  switch (status) {
    case "Available":
      return { bg: "#ECFDF5", border: "#A7F3D0", text: "#059669", dot: "#10B981", label: "Available" };
    case "Running":
      return { bg: "#EFF6FF", border: "#BFDBFE", text: "#1D4ED8", dot: "#3B82F6", label: "Running" };
    case "Maintenance":
      return { bg: "#FEF2F2", border: "#FECACA", text: "#DC2626", dot: "#EF4444", label: "Maintenance" };
    case "Cleaning":
      return { bg: "#FFFBEB", border: "#FDE68A", text: "#D97706", dot: "#F59E0B", label: "Cleaning" };
    default:
      return { bg: "#F1F5F9", border: "#E2E8F0", text: "#64748B", dot: "#94A3B8", label: status };
  }
};

export default function MachinesScreen() {
  const { user, branches, selectedBranchId, setSelectedBranchId } = useAuth();
  const router = useRouter();
  const [list, setList] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState("All");
  const [sourceTab, setSourceTab] = useState<SourceTab>("All");

  const { isSyncing, triggerSync } = useSync();
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

  const load = useCallback(async (bid = selectedBranchId) => {
    try {
      const qs = new URLSearchParams();
      if (bid) qs.set("branch_id", bid);
      const d = await api<Machine[]>(`/machines?${qs.toString()}`);
      setList(d);
    } catch (err) {
      console.error("Failed to fetch machines:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedBranchId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load(selectedBranchId);
  }, [load, selectedBranchId]));

  useSyncRefresh(useCallback(async () => {
    await load(selectedBranchId);
  }, [load, selectedBranchId]));

  const handleSelectBranch = (bid: string) => {
    setSelectedBranchId(bid);
    setBranchModalOpen(false);
    setLoading(true);
    load(bid);
  };

  const filteredList = useMemo(() => {
    if (filterStatus === "All") return list;
    return list.filter(m => m.status === filterStatus);
  }, [list, filterStatus]);

  const inhouseList = useMemo(() => {
    return filteredList.filter(m => !m.is_outsourced);
  }, [filteredList]);

  const outsourcedList = useMemo(() => {
    return filteredList.filter(m => !!m.is_outsourced);
  }, [filteredList]);

  const totalInhouseCap = useMemo(() => {
    return inhouseList.reduce((sum, m) => sum + (m.capacity || 0), 0);
  }, [inhouseList]);

  const totalOutsourcedCap = useMemo(() => {
    return outsourcedList.reduce((sum, m) => sum + (m.capacity || 0), 0);
  }, [outsourcedList]);

  const renderMachineCard = (m: Machine) => {
    const statusMeta = getStatusMeta(m.status);
    const isOutsourced = !!m.is_outsourced;

    return (
      <TouchableOpacity
        testID={`machine-${m.id}`}
        key={m.id}
        style={[
          styles.card,
          isOutsourced ? styles.cardOutsourced : styles.cardInhouse,
        ]}
        onPress={() => router.push(`/machine/${m.id}`)}
        activeOpacity={0.88}
      >
        {/* Top Header Row: In-House Factory Icon vs Vendor Truck Icon (Left) & Compact Status Pill (Right) */}
        <View style={styles.cardHeaderRow}>
          <View style={[styles.iconBox, { backgroundColor: isOutsourced ? "#FFF3E0" : "#E8F5E9" }]}>
            <MaterialCommunityIcons
              name={isOutsourced ? "truck-delivery-outline" : "factory"}
              size={17}
              color={isOutsourced ? "#E65100" : colors.primary}
            />
          </View>

          <View style={[styles.compactStatusPill, { backgroundColor: statusMeta.bg, borderColor: statusMeta.border }]}>
            <View style={[styles.compactStatusDot, { backgroundColor: statusMeta.dot }]} />
            <Text style={[styles.compactStatusText, { color: statusMeta.text }]}>
              {statusMeta.label}
            </Text>
          </View>
        </View>

        {/* Machine Name */}
        <Text style={styles.machineName} numberOfLines={1}>
          {m.name}
        </Text>

        {/* Location & Vendor Info */}
        <View style={styles.metaRow}>
          <MaterialCommunityIcons name="map-marker-outline" size={11} color={colors.textMuted} />
          <Text style={styles.branchNameText} numberOfLines={1}>
            {isOutsourced && m.vendor_name ? m.vendor_name : (m.branch_name || "Main Branch")}
          </Text>
          {isOutsourced && m.vendor_rate_per_kg ? (
            <Text style={styles.vendorRateMini}>₹{m.vendor_rate_per_kg}/kg</Text>
          ) : null}
        </View>

        {/* Active Batch Box (Only shown when running with active batch) */}
        {m.current_batch ? (
          <View style={styles.activeBatchBox}>
            <View style={styles.batchTopLine}>
              <View style={styles.batchPulseDot} />
              <Text style={styles.batchNumberText} numberOfLines={1}>
                {m.current_batch.batch_no}
              </Text>
            </View>
            <Text style={styles.batchCustomerName} numberOfLines={1}>
              {m.current_batch.customer_name}
            </Text>
          </View>
        ) : null}

        {/* Action Button: Directly Load or Stop */}
        {m.status === "Available" ? (
          <TouchableOpacity
            style={[styles.actionBtn, isOutsourced ? styles.actionBtnVendor : styles.actionBtnPrimary]}
            onPress={(e) => {
              e.stopPropagation();
              router.push({
                pathname: "/load-dryer",
                params: { machineId: m.id, machineName: m.name }
              });
            }}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="plus" size={13} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>
              {isOutsourced ? "Load Vendor" : "Load Dryer"}
            </Text>
          </TouchableOpacity>
        ) : m.status === "Running" ? (
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnStop]}
            onPress={(e) => {
              e.stopPropagation();
              router.push({
                pathname: "/stop-dryer",
                params: { machineId: m.id, machineName: m.name }
              });
            }}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="stop-circle-outline" size={13} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>Stop Dryer</Text>
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
    );
  };

  const selectedBranchName = selectedBranchId
    ? (branches.find(b => b.id === selectedBranchId)?.name || "Selected Branch")
    : "All Branches";

  return (
    <View style={styles.safe}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Machines</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
            <Text style={styles.subtitle}>{filteredList.length} dryers ({inhouseList.length} in-house, {outsourcedList.length} vendor)</Text>
            {user?.role === "Admin" && (
              <TouchableOpacity
                onPress={() => setBranchModalOpen(true)}
                style={styles.inlineBranchSelector}
                activeOpacity={0.7}
              >
                <Text style={styles.inlineBranchText}>
                  {selectedBranchId ? (branches.find(b => b.id === selectedBranchId)?.name || "Selected") : "All Branches"}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={12} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <TouchableOpacity
            testID="refresh-machine-button"
            style={styles.refreshBtn}
            onPress={triggerSync}
            disabled={isSyncing}
            activeOpacity={0.7}
            accessibilityLabel="Sync and Refresh"
          >
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <MaterialCommunityIcons name="sync" size={20} color={isSyncing ? colors.primary : "#475569"} />
            </Animated.View>
          </TouchableOpacity>
          {user?.role === "Admin" && (
            <TouchableOpacity
              testID="add-machine-button"
              style={styles.addBtn}
              onPress={() => router.push("/machine-form")}
            >
              <MaterialCommunityIcons name="plus" size={22} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Top Source Segmentation: All vs In-House vs Vendor */}
      <View style={styles.segmentContainer}>
        <TouchableOpacity
          style={[styles.segmentBtn, sourceTab === "All" && styles.segmentBtnActive]}
          onPress={() => setSourceTab("All")}
        >
          <Text style={[styles.segmentText, sourceTab === "All" && styles.segmentTextActiveDark]}>
            All ({filteredList.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, sourceTab === "In-House" && styles.segmentBtnActiveInhouse]}
          onPress={() => setSourceTab("In-House")}
        >
          <MaterialCommunityIcons
            name="factory"
            size={14}
            color={sourceTab === "In-House" ? "#fff" : colors.primary}
          />
          <Text style={[styles.segmentText, sourceTab === "In-House" && styles.segmentTextActiveWhite]}>
            In-House ({inhouseList.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, sourceTab === "Vendor" && styles.segmentBtnActiveOutsourced]}
          onPress={() => setSourceTab("Vendor")}
        >
          <MaterialCommunityIcons
            name="truck-delivery-outline"
            size={14}
            color={sourceTab === "Vendor" ? "#fff" : "#E65100"}
          />
          <Text style={[styles.segmentText, sourceTab === "Vendor" && styles.segmentTextActiveWhite]}>
            Vendor ({outsourcedList.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Status Filter Chips */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
          {STATUSES.map(s => (
            <TouchableOpacity
              key={s}
              testID={`machines-filter-${s.toLowerCase()}`}
              style={[styles.chip, filterStatus === s && styles.chipSelected]}
              onPress={() => setFilterStatus(s)}
            >
              <Text style={[styles.chipText, filterStatus === s && styles.chipTextSelected]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <Loader size={76} />
          <View style={styles.loadingPill}>
            <MaterialCommunityIcons name="office-building-marker-outline" size={13} color={colors.primary} />
            <Text style={styles.loadingPillText}>SYNCING BRANCH</Text>
          </View>
          <Text style={styles.loadingTitle}>{selectedBranchName}</Text>
          <Text style={styles.loadingSubtitle}>
            Updating live dryer telemetry, capacities & batch queues...
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(selectedBranchId); }} tintColor={colors.primary} />}
        >
          {/* In-House Section */}
          {(sourceTab === "All" || sourceTab === "In-House") && (
            <View style={styles.sectionWrap}>
              <View style={styles.sectionHeaderBanner}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={[styles.sectionIconBox, { backgroundColor: `${colors.primary}15` }]}>
                    <MaterialCommunityIcons name="factory" size={17} color={colors.primary} />
                  </View>
                  <Text style={styles.sectionTitleText}>In-House Dryers</Text>
                  <View style={styles.sectionCountPill}>
                    <Text style={styles.sectionCountPillText}>{inhouseList.length}</Text>
                  </View>
                </View>
                <Text style={styles.sectionCapText}>{totalInhouseCap.toLocaleString()} kg capacity</Text>
              </View>

              {inhouseList.length > 0 ? (
                <View style={styles.grid}>
                  {inhouseList.map(renderMachineCard)}
                </View>
              ) : (
                <View style={styles.emptySectionBox}>
                  <Text style={styles.emptySectionText}>No in-house dryers found for this status.</Text>
                </View>
              )}
            </View>
          )}

          {/* Outsourced / Vendor Section */}
          {(sourceTab === "All" || sourceTab === "Vendor") && (
            <View style={[styles.sectionWrap, { marginTop: sourceTab === "All" ? spacing.xl : 0 }]}>
              <View style={[styles.sectionHeaderBanner, styles.sectionHeaderBannerOutsourced]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={[styles.sectionIconBox, { backgroundColor: "#FFE08250" }]}>
                    <MaterialCommunityIcons name="truck-delivery-outline" size={17} color="#E65100" />
                  </View>
                  <Text style={[styles.sectionTitleText, { color: "#E65100" }]}>Vendor / Outsourced Dryers</Text>
                  <View style={[styles.sectionCountPill, { backgroundColor: "#FFE082" }]}>
                    <Text style={[styles.sectionCountPillText, { color: "#E65100" }]}>{outsourcedList.length}</Text>
                  </View>
                </View>
                {outsourcedList.length > 0 && (
                  <Text style={[styles.sectionCapText, { color: "#E65100" }]}>{totalOutsourcedCap.toLocaleString()} kg capacity</Text>
                )}
              </View>

              {outsourcedList.length > 0 ? (
                <View style={styles.grid}>
                  {outsourcedList.map(renderMachineCard)}
                </View>
              ) : (
                <View style={styles.vendorEmptyBox}>
                  <MaterialCommunityIcons name="truck-delivery-outline" size={32} color="#FFA726" />
                  <Text style={styles.vendorEmptyTitle}>No Vendor Dryers Configured</Text>
                  <Text style={styles.vendorEmptyDesc}>
                    When in-house capacity is exceeded, configure third-party dryers to outsource batches seamlessly.
                  </Text>
                  {user?.role === "Admin" && (
                    <TouchableOpacity
                      style={styles.addVendorBtn}
                      onPress={() => router.push({ pathname: "/machine-form", params: { outsourced: "1" } })}
                    >
                      <MaterialCommunityIcons name="plus" size={16} color="#fff" />
                      <Text style={styles.addVendorBtnText}>Add Vendor Dryer</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* Branch Selector Modal */}
      <Modal
        visible={branchModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setBranchModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setBranchModalOpen(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Select Branch</Text>
            <ScrollView style={styles.modalScroll}>
              <TouchableOpacity
                style={[styles.modalItem, !selectedBranchId && styles.modalItemSelected]}
                onPress={() => handleSelectBranch("")}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={[styles.modalItemIcon, !selectedBranchId && styles.modalItemIconActive]}>
                    <MaterialCommunityIcons name="domain" size={18} color={!selectedBranchId ? colors.primary : "#64748B"} />
                  </View>
                  <Text style={[styles.modalItemText, !selectedBranchId && styles.modalItemTextSelected]}>
                    All Branches
                  </Text>
                </View>
                {!selectedBranchId && <MaterialCommunityIcons name="check-circle" size={18} color={colors.primary} />}
              </TouchableOpacity>

              {branches.map(b => (
                <TouchableOpacity
                  key={b.id}
                  style={[styles.modalItem, selectedBranchId === b.id && styles.modalItemSelected]}
                  onPress={() => handleSelectBranch(b.id)}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={[styles.modalItemIcon, selectedBranchId === b.id && styles.modalItemIconActive]}>
                      <MaterialCommunityIcons name="factory" size={18} color={selectedBranchId === b.id ? colors.primary : "#64748B"} />
                    </View>
                    <Text style={[styles.modalItemText, selectedBranchId === b.id && styles.modalItemTextSelected]}>
                      {b.name}
                    </Text>
                  </View>
                  {selectedBranchId === b.id && <MaterialCommunityIcons name="check-circle" size={18} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setBranchModalOpen(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.xl, paddingBottom: spacing.md },
  title: { fontSize: 26, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  addBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", ...shadow.fab },
  filterContainer: { marginBottom: spacing.md },
  chipsScroll: { paddingHorizontal: spacing.xl, gap: spacing.sm, paddingBottom: 2 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
  },
  chipTextSelected: {
    color: "#FFFFFF",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
  },
  card: {
    width: "48.5%",
    borderRadius: 14,
    padding: 10,
    borderWidth: 1.5,
    justifyContent: "space-between",
  },
  cardInhouse: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    ...shadow.card,
  },
  cardOutsourced: {
    backgroundColor: "#FFFCF7",
    borderColor: "#FED7AA",
    ...shadow.card,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "nowrap",
    marginBottom: 4,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  compactStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: "center",
  },
  compactStatusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  compactStatusText: {
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  machineName: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.2,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
    marginBottom: 2,
  },
  branchNameText: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: "600",
    flex: 1,
  },
  vendorRateMini: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#E65100",
  },
  activeBatchBox: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    padding: 6,
    borderRadius: 7,
    marginTop: 4,
    marginBottom: 2,
  },
  batchTopLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  batchPulseDot: {
    width: 4.5,
    height: 4.5,
    borderRadius: 2.5,
    backgroundColor: "#16A34A",
  },
  batchNumberText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#15803D",
  },
  batchCustomerName: {
    fontSize: 10.5,
    fontWeight: "600",
    color: "#1F2937",
    marginTop: 1,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 8,
    paddingVertical: 6,
    marginTop: 6,
  },
  actionBtnPrimary: {
    backgroundColor: colors.primary,
  },
  actionBtnVendor: {
    backgroundColor: "#E65100",
  },
  actionBtnStop: {
    backgroundColor: colors.danger,
  },
  actionBtnText: {
    color: "#FFFFFF",
    fontSize: 11.5,
    fontWeight: "800",
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: spacing.xl,
  },
  loadingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: `${colors.primary}15`,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.pill,
    marginTop: 12,
  },
  loadingPillText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 0.6,
  },
  loadingTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    marginTop: 8,
    textAlign: "center",
  },
  loadingSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
    textAlign: "center",
    maxWidth: 260,
    lineHeight: 18,
  },
  segmentContainer: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: radius.lg,
    padding: 3,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    borderRadius: radius.md,
    gap: 4,
  },
  segmentBtnActive: {
    backgroundColor: "#FFFFFF",
    ...shadow.sm,
  },
  segmentBtnActiveInhouse: {
    backgroundColor: colors.primary,
    ...shadow.sm,
  },
  segmentBtnActiveOutsourced: {
    backgroundColor: "#E65100",
    ...shadow.sm,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
  },
  segmentTextActiveDark: {
    color: colors.text,
  },
  segmentTextActiveWhite: {
    color: "#FFFFFF",
  },
  sectionWrap: {
    marginBottom: spacing.md,
  },
  sectionHeaderBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: `${colors.primary}0D`,
    borderLeftWidth: 3.5,
    borderLeftColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  sectionHeaderBannerOutsourced: {
    backgroundColor: "#FFF8E1",
    borderLeftColor: "#E65100",
  },
  sectionIconBox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitleText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
  },
  sectionCountPill: {
    backgroundColor: `${colors.primary}20`,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 10,
  },
  sectionCountPillText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary,
  },
  sectionCapText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
  },
  emptySectionBox: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptySectionText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  vendorEmptyBox: {
    backgroundColor: "#FFFCF5",
    borderWidth: 1.5,
    borderColor: "#FFE082",
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  vendorEmptyTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#E65100",
    marginTop: 8,
  },
  vendorEmptyDesc: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 12,
    lineHeight: 18,
    paddingHorizontal: spacing.md,
  },
  addVendorBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E65100",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
    gap: 4,
  },
  addVendorBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  inlineBranchSelector: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: `${colors.primary}12`,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    gap: 4,
  },
  inlineBranchText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary,
  },
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
    maxHeight: "80%",
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
    marginBottom: spacing.md,
  },
  modalScroll: {
    marginBottom: spacing.lg,
  },
  modalItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  modalItemSelected: {
    borderColor: colors.primary,
  },
  modalItemIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  modalItemIconActive: {
    backgroundColor: `${colors.primary}18`,
  },
  modalItemText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: "600",
  },
  modalItemTextSelected: {
    color: colors.primary,
    fontWeight: "700",
  },
  modalCloseBtn: {
    paddingVertical: 14,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
  },
  modalCloseText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textMuted,
  },
});
