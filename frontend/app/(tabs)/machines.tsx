import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import Loader from "@/src/components/Loader";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { StatusPill } from "@/src/components/ui";

type Machine = {
  id: string; name: string; capacity: number; status: string; branch_name?: string;
  is_outsourced?: boolean; vendor_name?: string; vendor_phone?: string; vendor_rate_per_kg?: number;
  current_batch?: { id: string; batch_no: string; customer_name: string; expected_delivery_date?: string; status: string };
};

const STATUSES = ["All", "Available", "Running", "Maintenance", "Cleaning"];
const SOURCE_TABS = ["All", "In-House", "Vendor"] as const;
type SourceTab = typeof SOURCE_TABS[number];

export default function MachinesScreen() {
  const { user, branches, selectedBranchId, setSelectedBranchId } = useAuth();
  const router = useRouter();
  const [list, setList] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState("All");
  const [sourceTab, setSourceTab] = useState<SourceTab>("All");

  const selectedBranch = selectedBranchId;
  const setSelectedBranch = setSelectedBranchId;

  const load = useCallback(async (bid = selectedBranch) => {
    try {
      const qs = new URLSearchParams();
      if (bid) qs.set("branch_id", bid);
      const d = await api<Machine[]>(`/machines?${qs.toString()}`);
      setList(d);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedBranch]);

  useFocusEffect(useCallback(() => {
    load(selectedBranch);
  }, [load, selectedBranch]));

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

  const renderMachineCard = (m: Machine) => (
    <TouchableOpacity
      testID={`machine-${m.id}`}
      key={m.id}
      style={[styles.card, m.is_outsourced && styles.cardOutsourced]}
      onPress={() => router.push(`/machine/${m.id}`)}
      activeOpacity={0.85}
    >
      <View style={styles.cardTop}>
        <View style={[styles.iconBox, { backgroundColor: m.is_outsourced ? "#FFE08250" : `${colors.status[m.status]}15` }]}>
          <MaterialCommunityIcons
            name={m.is_outsourced ? "truck-delivery-outline" : "engine-outline"}
            size={26}
            color={m.is_outsourced ? "#E65100" : colors.status[m.status]}
          />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={[styles.typeBadge, m.is_outsourced ? styles.typeBadgeOutsourced : styles.typeBadgeInhouse]}>
            <Text style={[styles.typeBadgeText, m.is_outsourced ? styles.typeBadgeTextOutsourced : styles.typeBadgeTextInhouse]}>
              {m.is_outsourced ? "Vendor" : "In-House"}
            </Text>
          </View>
          <StatusPill status={m.status} />
        </View>
      </View>
      <Text style={styles.machineName}>{m.name}</Text>
      
      {m.is_outsourced && m.vendor_name ? (
        <Text style={styles.vendorNameText} numberOfLines={1}>
          <MaterialCommunityIcons name="office-building" size={11} color="#E65100" /> {m.vendor_name}
        </Text>
      ) : null}

      <Text style={styles.branchNameText}>
        <MaterialCommunityIcons name="map-marker-outline" size={10} color={colors.textMuted} /> {m.branch_name || "Main Branch"}
      </Text>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={styles.capacity}>Capacity {m.capacity}kg</Text>
        {m.is_outsourced && m.vendor_rate_per_kg ? (
          <Text style={styles.vendorRateText}>₹{m.vendor_rate_per_kg}/kg</Text>
        ) : null}
      </View>

      {m.current_batch ? (
        <View style={styles.batchInfo}>
          <View style={styles.batchLabel}>
            <MaterialCommunityIcons name="package-variant" size={12} color={colors.primary} />
            <Text style={styles.batchLabelText}>{m.current_batch.batch_no}</Text>
          </View>
          <Text style={styles.batchCust} numberOfLines={1}>{m.current_batch.customer_name}</Text>
        </View>
      ) : (
        <View style={[styles.batchInfo, { backgroundColor: colors.border + "60" }]}>
          <Text style={styles.emptyBatch}>No active batch</Text>
        </View>
      )}
      {m.status === "Available" ? (
        <TouchableOpacity
          style={[styles.actionBtn, m.is_outsourced && { backgroundColor: "#E65100" }]}
          onPress={(e) => {
            e.stopPropagation();
            router.push({
              pathname: "/load-dryer",
              params: { machineId: m.id, machineName: m.name }
            });
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.actionBtnText}>{m.is_outsourced ? "Load Vendor Dryer" : "Load Dryer"}</Text>
        </TouchableOpacity>
      ) : m.status === "Running" ? (
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.danger }]}
          onPress={(e) => {
            e.stopPropagation();
            router.push({
              pathname: "/stop-dryer",
              params: { machineId: m.id, machineName: m.name }
            });
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.actionBtnText}>Stop Dryer</Text>
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );

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
        <View style={{ paddingVertical: 40, alignItems: "center" }}><Loader size={60} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(selectedBranch); }} tintColor={colors.primary} />}
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
                onPress={() => {
                  setSelectedBranchId("");
                  setBranchModalOpen(false);
                }}
              >
                <Text style={[styles.modalItemText, !selectedBranchId && styles.modalItemTextSelected]}>
                  All Branches
                </Text>
                {!selectedBranchId && <MaterialCommunityIcons name="check" size={18} color={colors.primary} />}
              </TouchableOpacity>

              {branches.map(b => (
                <TouchableOpacity
                  key={b.id}
                  style={[styles.modalItem, selectedBranchId === b.id && styles.modalItemSelected]}
                  onPress={() => {
                    setSelectedBranchId(b.id);
                    setBranchModalOpen(false);
                  }}
                >
                  <Text style={[styles.modalItemText, selectedBranchId === b.id && styles.modalItemTextSelected]}>
                    {b.name}
                  </Text>
                  {selectedBranchId === b.id && <MaterialCommunityIcons name="check" size={18} color={colors.primary} />}
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
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  card: {
    width: "47.8%",
    backgroundColor: colors.card,
    borderRadius: radius.xxl,
    padding: spacing.lg,
    gap: 6,
    ...shadow.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardOutsourced: {
    borderColor: "#FFA726",
    borderWidth: 1.5,
    backgroundColor: "#FFFCF5",
  },
  vendorRateText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#E65100",
    marginBottom: spacing.sm,
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
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  iconBox: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  machineName: { fontSize: 16, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  capacity: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm },
  batchInfo: { backgroundColor: colors.primary50, padding: 8, borderRadius: radius.md, marginTop: 4 },
  batchLabel: { flexDirection: "row", alignItems: "center", gap: 4 },
  batchLabelText: { fontSize: 11, fontWeight: "800", color: colors.primary, letterSpacing: 0.3 },
  batchCust: { fontSize: 12, color: colors.text, fontWeight: "600", marginTop: 2 },
  emptyBatch: { fontSize: 11, color: colors.textMuted, fontWeight: "600", textAlign: "center" },
  actionBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  actionBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  branchNameText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "700",
    marginTop: 2,
    marginBottom: 2,
  },
  vendorNameText: {
    fontSize: 11,
    color: "#E65100",
    fontWeight: "700",
    marginTop: 1,
    marginBottom: 2,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadgeInhouse: {
    backgroundColor: `${colors.primary}15`,
  },
  typeBadgeOutsourced: {
    backgroundColor: "#FFE08260",
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  typeBadgeTextInhouse: {
    color: colors.primary,
  },
  typeBadgeTextOutsourced: {
    color: "#E65100",
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
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  modalItemSelected: {
    borderColor: colors.primary,
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
