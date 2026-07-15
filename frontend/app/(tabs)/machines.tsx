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
  current_batch?: { id: string; batch_no: string; customer_name: string; expected_delivery_date?: string; status: string };
};

const STATUSES = ["All", "Available", "Running", "Maintenance", "Cleaning"];

export default function MachinesScreen() {
  const { user, branches, selectedBranchId, setSelectedBranchId } = useAuth();
  const router = useRouter();
  const [list, setList] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState("All");

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

  return (
    <View style={styles.safe}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Machines</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
            <Text style={styles.subtitle}>{filteredList.length} dryers</Text>
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
          <View style={styles.grid}>
            {filteredList.map(m => (
              <TouchableOpacity
                testID={`machine-${m.id}`}
                key={m.id}
                style={styles.card}
                onPress={() => router.push(`/machine/${m.id}`)}
                activeOpacity={0.85}
              >
                <View style={styles.cardTop}>
                  <View style={[styles.iconBox, { backgroundColor: `${colors.status[m.status]}15` }]}>
                    <MaterialCommunityIcons name="engine-outline" size={26} color={colors.status[m.status]} />
                  </View>
                  <StatusPill status={m.status} />
                </View>
                <Text style={styles.machineName}>{m.name}</Text>
                
                <Text style={styles.branchNameText}>
                  <MaterialCommunityIcons name="map-marker-outline" size={10} color={colors.textMuted} /> {m.branch_name || "Main Branch"}
                </Text>

                <Text style={styles.capacity}>Capacity {m.capacity}kg</Text>

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
                    style={styles.actionBtn}
                    onPress={(e) => {
                      e.stopPropagation();
                      router.push({
                        pathname: "/load-dryer",
                        params: { machineId: m.id, machineName: m.name }
                      });
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.actionBtnText}>Load Dryer</Text>
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
            ))}
          </View>
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
