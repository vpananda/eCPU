import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { useToast } from "@/src/components/Toast";
import { StatusPill } from "@/src/components/ui";
import { useAuth } from "@/src/auth";
import Loader from "@/src/components/Loader";

type Batch = {
  id: string;
  batch_no: string;
  status: string;
  raw_weight: number;
  actual_dry_weight?: number;
  arrival_date?: string;
  created_at?: string;
  processing_started_at?: string;
  processing_ended_at?: string;
  branch_id?: string;
  branch_name?: string;
  customer?: { id: string; name: string; code: string; mobile: string };
  product?: { name: string };
  balance_amount?: number;
};

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
      // Safety filter: ensure branch matches if selected
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

  const filtered = useMemo(() => {
    if (!q.trim()) return batches;
    const term = q.toLowerCase();
    return batches.filter(b =>
      b.customer?.name?.toLowerCase().includes(term) ||
      b.customer?.mobile?.includes(term) ||
      b.customer?.code?.toLowerCase().includes(term) ||
      b.batch_no?.toLowerCase().includes(term)
    );
  }, [batches, q]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="delivery-picker-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.title}>Select for Delivery</Text>
          {selectedBranchId ? (
            <View style={styles.branchPill}>
              <MaterialCommunityIcons name="office-building" size={12} color={colors.primary} />
              <Text style={styles.branchPillText}>{activeBranchName}</Text>
            </View>
          ) : null}
        </View>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.searchWrap}>
        <MaterialCommunityIcons name="magnify" size={18} color={colors.textMuted} />
        <TextInput
          testID="delivery-picker-search"
          style={styles.search}
          placeholder="Search customer, code, mobile or batch..."
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

      {loading ? (
        <View style={styles.loaderWrap}>
          <Loader size={76} />
          <Text style={styles.loaderTitle}>Loading Completed Batches...</Text>
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
          contentContainerStyle={{ padding: spacing.xl, gap: spacing.sm, paddingBottom: 100 }}
        >
          {filtered.length === 0 && (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="check-circle-outline" size={44} color={colors.textLight} />
              <Text style={styles.emptyText}>No completed batches in {activeBranchName}</Text>
              <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: "center", marginTop: 4 }}>
                Batches must have drying marked as "Completed" before they appear for delivery.
              </Text>
            </View>
          )}
          {filtered.map(b => (
            <TouchableOpacity
              key={b.id}
              testID={`delivery-pick-${b.id}`}
              style={styles.item}
              activeOpacity={0.85}
              onPress={() => router.push(`/delivery/${b.id}`)}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(b.customer?.name || "?").slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{b.customer?.name}</Text>
                  <StatusPill status={b.status} />
                </View>

                {/* Highlighted Arrival Date */}
                <View style={styles.arrivalBadge}>
                  <MaterialCommunityIcons name="calendar-import" size={11} color="#166534" />
                  <Text style={styles.arrivalBadgeLabel}>Arrived:</Text>
                  <Text style={styles.arrivalBadgeDate}>{fmtDate(b.arrival_date || b.created_at)}</Text>
                  {b.processing_ended_at ? (
                    <>
                      <Text style={{ color: "#BBF7D0", marginHorizontal: 3 }}>•</Text>
                      <MaterialCommunityIcons name="check-circle" size={11} color="#166534" />
                      <Text style={styles.arrivalBadgeLabel}>Dried:</Text>
                      <Text style={styles.arrivalBadgeDate}>{fmtDate(b.processing_ended_at)}</Text>
                    </>
                  ) : null}
                </View>

                <Text style={styles.meta}>
                  {b.batch_no} · {b.product?.name || "Cardamom"} · {b.raw_weight}kg wet
                  {b.actual_dry_weight ? ` · ${b.actual_dry_weight}kg dry` : ""}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
                  <Text style={styles.phone}>{b.customer?.mobile}</Text>
                  {b.branch_name ? (
                    <Text style={styles.branchTag}>• {b.branch_name}</Text>
                  ) : null}
                </View>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textLight} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: 18, fontWeight: "800", color: colors.text },
  branchPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primary50, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, marginTop: 2 },
  branchPillText: { fontSize: 11, fontWeight: "700", color: colors.primary },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: spacing.xl, backgroundColor: colors.card, borderRadius: radius.lg, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border },
  search: { flex: 1, paddingVertical: 12, fontSize: 14, color: colors.text },
  item: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, padding: spacing.md, borderRadius: radius.xl, gap: spacing.md, ...shadow.card },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary50, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 17, fontWeight: "800", color: colors.primary },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  arrivalBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    alignSelf: "flex-start",
    marginTop: 3,
  },
  arrivalBadgeLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#065F46",
  },
  arrivalBadgeDate: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#166534",
  },
  name: { fontSize: 15, fontWeight: "800", color: colors.text, flexShrink: 1 },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  phone: { fontSize: 11, color: colors.textLight, marginTop: 2 },
  branchTag: { fontSize: 11, color: colors.primary, fontWeight: "600" },
  empty: { alignItems: "center", paddingVertical: 60, gap: 6 },
  emptyText: { fontSize: 14, color: colors.textMuted, fontWeight: "600", marginTop: 8, textAlign: "center" },
  loaderWrap: { paddingTop: 80, alignItems: "center", justifyContent: "center" },
  loaderTitle: { fontSize: 16, fontWeight: "800", color: colors.text, marginTop: 12 },
  loaderSub: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
});
