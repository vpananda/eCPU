import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import Loader from "@/src/components/Loader";
import { colors, radius, shadow, spacing } from "@/src/theme";

type Customer = { id: string; code: string; name: string; mobile: string; village?: string; taluk?: string; district?: string; branch_id?: string; branch_name?: string; total_arrivals?: number; total_amount?: number; amount_received?: number };

const STATUSES = ["All", "Active", "Inactive"];

export default function CustomersScreen() {
  const { user, branches, selectedBranchId, setSelectedBranchId } = useAuth();
  const router = useRouter();
  const [list, setList] = useState<Customer[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("Active");
  const [loading, setLoading] = useState(true);
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState<"All" | "FullyPaid" | "PartialPaid" | "NoPayment">("All");
  const [sortBy, setSortBy] = useState<"name" | "arrivals" | "billed" | "pending">("name");

  const load = useCallback(async (search = "", currentFilter = filter) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search) qs.set("q", search);
      qs.set("status", currentFilter.toLowerCase());
      const path = `/customers?${qs.toString()}`;
      const data = await api<Customer[]>(path);
      setList(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load(q, filter);
  }, [load, q, filter]));

  const processedList = React.useMemo(() => {
    let result = list.filter(item => {
      if (selectedBranchId && item.branch_id !== selectedBranchId) return false;
      return true;
    });

    if (paymentFilter === "FullyPaid") {
      result = result.filter(item => {
        const billed = item.total_amount || 0;
        const rec = item.amount_received || 0;
        return billed > 0 && billed === rec;
      });
    } else if (paymentFilter === "PartialPaid") {
      result = result.filter(item => {
        const billed = item.total_amount || 0;
        const rec = item.amount_received || 0;
        return rec > 0 && rec < billed;
      });
    } else if (paymentFilter === "NoPayment") {
      result = result.filter(item => {
        const billed = item.total_amount || 0;
        const rec = item.amount_received || 0;
        return billed > 0 && rec === 0;
      });
    }

    if (sortBy === "name") {
      result.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else if (sortBy === "arrivals") {
      result.sort((a, b) => (b.total_arrivals || 0) - (a.total_arrivals || 0));
    } else if (sortBy === "billed") {
      result.sort((a, b) => (b.total_amount || 0) - (a.total_amount || 0));
    } else if (sortBy === "pending") {
      result.sort((a, b) => {
        const pendA = (a.total_amount || 0) - (a.amount_received || 0);
        const pendB = (b.total_amount || 0) - (b.amount_received || 0);
        return pendB - pendA;
      });
    }

    return result;
  }, [list, selectedBranchId, paymentFilter, sortBy]);

  return (
    <View style={styles.safe}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Customers</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
            <Text style={styles.subtitle}>
              {processedList.length} {filter === "All" ? "total" : filter.toLowerCase()}
            </Text>
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
        <TouchableOpacity
          testID="add-customer-button"
          style={styles.addBtn}
          onPress={() => router.push("/customer-form")}
        >
          <MaterialCommunityIcons name="plus" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Status Filter Chips */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
          {STATUSES.map(s => (
            <TouchableOpacity
              key={s}
              testID={`customers-filter-${s.toLowerCase()}`}
              style={[styles.chip, filter === s && styles.chipSelected]}
              onPress={() => setFilter(s)}
            >
              <Text style={[styles.chipText, filter === s && styles.chipTextSelected]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.searchWrap}>
        <MaterialCommunityIcons name="magnify" size={20} color={colors.textMuted} />
        <TextInput
          testID="customer-search-input"
          style={styles.searchInput}
          placeholder="Search by name, mobile or code..."
          placeholderTextColor={colors.textLight}
          value={q}
          onChangeText={setQ}
          returnKeyType="search"
          onSubmitEditing={() => load(q)}
        />
        {q ? (
          <TouchableOpacity onPress={() => { setQ(""); load(""); }}>
            <MaterialCommunityIcons name="close-circle" size={18} color={colors.textLight} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Payment Filter Row */}
      <View style={{ marginBottom: spacing.xs, marginTop: spacing.xs }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
          <TouchableOpacity
            testID="customers-pay-filter-all"
            style={[styles.smallChip, paymentFilter === "All" && styles.chipSelected]}
            onPress={() => setPaymentFilter("All")}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="credit-card-outline" size={14} color={paymentFilter === "All" ? "#fff" : colors.textMuted} style={{ marginRight: 4 }} />
            <Text style={[styles.smallChipText, paymentFilter === "All" && { color: "#fff" }]}>All Payments</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            testID="customers-pay-filter-fully"
            style={[styles.smallChip, paymentFilter === "FullyPaid" && styles.chipSelected]}
            onPress={() => setPaymentFilter("FullyPaid")}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="check-circle-outline" size={14} color={paymentFilter === "FullyPaid" ? "#fff" : colors.success} style={{ marginRight: 4 }} />
            <Text style={[styles.smallChipText, paymentFilter === "FullyPaid" && { color: "#fff" }]}>Fully Paid</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="customers-pay-filter-partial"
            style={[styles.smallChip, paymentFilter === "PartialPaid" && styles.chipSelected]}
            onPress={() => setPaymentFilter("PartialPaid")}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="alert-circle-outline" size={14} color={paymentFilter === "PartialPaid" ? "#fff" : colors.accent} style={{ marginRight: 4 }} />
            <Text style={[styles.smallChipText, paymentFilter === "PartialPaid" && { color: "#fff" }]}>Partially Paid</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="customers-pay-filter-none"
            style={[styles.smallChip, paymentFilter === "NoPayment" && styles.chipSelected]}
            onPress={() => setPaymentFilter("NoPayment")}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="close-circle-outline" size={14} color={paymentFilter === "NoPayment" ? "#fff" : colors.danger} style={{ marginRight: 4 }} />
            <Text style={[styles.smallChipText, paymentFilter === "NoPayment" && { color: "#fff" }]}>No Payment</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Sort Options Row */}
      <View style={{ marginBottom: spacing.xs }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
          <TouchableOpacity
            testID="customers-sort-name"
            style={[styles.smallChip, sortBy === "name" && styles.chipSelected]}
            onPress={() => setSortBy("name")}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="sort-alphabetical-ascending" size={14} color={sortBy === "name" ? "#fff" : colors.textMuted} style={{ marginRight: 4 }} />
            <Text style={[styles.smallChipText, sortBy === "name" && { color: "#fff" }]}>Name</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="customers-sort-arrivals"
            style={[styles.smallChip, sortBy === "arrivals" && styles.chipSelected]}
            onPress={() => setSortBy("arrivals")}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="history" size={14} color={sortBy === "arrivals" ? "#fff" : colors.textMuted} style={{ marginRight: 4 }} />
            <Text style={[styles.smallChipText, sortBy === "arrivals" && { color: "#fff" }]}>Arrivals</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="customers-sort-billed"
            style={[styles.smallChip, sortBy === "billed" && styles.chipSelected]}
            onPress={() => setSortBy("billed")}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="cash" size={14} color={sortBy === "billed" ? "#fff" : colors.textMuted} style={{ marginRight: 4 }} />
            <Text style={[styles.smallChipText, sortBy === "billed" && { color: "#fff" }]}>Total Billed</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="customers-sort-pending"
            style={[styles.smallChip, sortBy === "pending" && styles.chipSelected]}
            onPress={() => setSortBy("pending")}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="cash-minus" size={14} color={sortBy === "pending" ? "#fff" : colors.textMuted} style={{ marginRight: 4 }} />
            <Text style={[styles.smallChipText, sortBy === "pending" && { color: "#fff" }]}>Highest Pending</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>



      {loading ? (
        <View style={{ paddingVertical: 40, alignItems: "center" }}><Loader size={60} /></View>
      ) : (
        <FlatList
          data={processedList}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120, gap: spacing.md }}
          ListEmptyComponent={() => (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="account-search-outline" size={48} color={colors.textLight} />
              <Text style={styles.emptyText}>No customers yet</Text>
              <Text style={styles.emptySub}>Tap + to add your first customer</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`customer-${item.id}`}
              style={styles.item}
              onPress={() => router.push(`/customer/${item.id}`)}
              activeOpacity={0.85}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(item.name || "?").slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <View style={styles.codeChip}><Text style={styles.codeText}>{item.code}</Text></View>
                </View>
                <View style={styles.metaRow}>
                  <MaterialCommunityIcons name="phone" size={12} color={colors.textMuted} />
                  <Text style={styles.meta}>{item.mobile}</Text>
                  {item.village ? (
                    <>
                      <View style={styles.metaDot} />
                      <MaterialCommunityIcons name="map-marker" size={12} color={colors.textMuted} />
                      <Text style={styles.meta} numberOfLines={1}>{item.village}</Text>
                    </>
                  ) : null}
                  {item.branch_name && item.branch_name !== "-" ? (
                    <>
                      <View style={styles.metaDot} />
                      <MaterialCommunityIcons name="storefront" size={12} color={colors.primary} />
                      <Text style={[styles.meta, { color: colors.primary, fontWeight: "700" }]} numberOfLines={1}>
                        {item.branch_name}
                      </Text>
                    </>
                  ) : null}
                </View>
                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <MaterialCommunityIcons name="history" size={12} color={colors.textMuted} />
                    <Text style={styles.statText}>{item.total_arrivals || 0} arrivals</Text>
                  </View>
                  <View style={styles.statItem}>
                    <MaterialCommunityIcons name="cash" size={12} color={colors.textMuted} />
                    <Text style={styles.statText}>₹{(item.total_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                  </View>
                  <View style={styles.statItem}>
                    <MaterialCommunityIcons name="cash-check" size={12} color={colors.primary} />
                    <Text style={[styles.statText, { color: colors.primary, fontWeight: "700" }]}>₹{(item.amount_received || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                  </View>
                </View>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textLight} />
            </TouchableOpacity>
          )}
        />
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
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    marginHorizontal: spacing.xl, backgroundColor: colors.card,
    borderRadius: radius.lg, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: colors.text },
  item: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, padding: spacing.md, borderRadius: radius.xl, gap: spacing.md, ...shadow.card },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary50, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 18, fontWeight: "800", color: colors.primary },
  name: { fontSize: 15, fontWeight: "700", color: colors.text },
  codeChip: { paddingHorizontal: 6, paddingVertical: 2, backgroundColor: colors.accent + "20", borderRadius: 6 },
  codeText: { fontSize: 10, fontWeight: "800", color: colors.accent, letterSpacing: 0.3 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  meta: { fontSize: 12, color: colors.textMuted, fontWeight: "500" },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.textLight, marginHorizontal: 4 },
  statsRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 },
  statItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  statText: { fontSize: 11, fontWeight: "600", color: colors.textMuted },
  empty: { alignItems: "center", paddingVertical: 60, gap: 6 },
  emptyText: { fontSize: 16, color: colors.text, fontWeight: "700", marginTop: 12 },
  emptySub: { fontSize: 13, color: colors.textMuted },
  filterContainer: { marginTop: spacing.md },
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
  smallChip: { 
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12, 
    height: 28, 
    borderRadius: radius.pill, 
    backgroundColor: colors.card, 
    borderWidth: 1, 
    borderColor: colors.border, 
    justifyContent: "center", 
    flexShrink: 0 
  },
  smallChipText: { fontSize: 11, fontWeight: "700", color: colors.textMuted },
});
