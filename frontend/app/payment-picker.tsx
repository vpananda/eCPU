import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/auth";

export default function PaymentPicker() {
  const router = useRouter();
  const toast = useToast();
  const { selectedBranchId } = useAuth();
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (selectedBranchId) qs.set("branch_id", selectedBranchId);
      const all = await api<any[]>(`/customers?${qs.toString()}`);
      const list = all.filter(c => (c.total_amount - c.amount_received) > 0.01);
      setCustomers(list);
    } catch (e: any) {
      toast.show(e.message || "Failed to load customers", "error");
    } finally { setLoading(false); }
  }, [selectedBranchId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  type SortKey = "due_desc" | "due_asc" | "name_asc" | "name_desc" | "code_asc";
  const [sortBy, setSortBy] = useState<SortKey>("due_desc");

  const filtered = useMemo(() => {
    let list = [...customers];
    if (q.trim()) {
      const t = q.toLowerCase();
      list = list.filter(c =>
        c.name?.toLowerCase().includes(t) ||
        c.mobile?.includes(t) ||
        c.code?.toLowerCase().includes(t)
      );
    }

    if (sortBy === "due_desc") {
      list.sort((a, b) => (b.total_amount - b.amount_received) - (a.total_amount - a.amount_received));
    } else if (sortBy === "due_asc") {
      list.sort((a, b) => (a.total_amount - a.amount_received) - (b.total_amount - b.amount_received));
    } else if (sortBy === "name_asc") {
      list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else if (sortBy === "name_desc") {
      list.sort((a, b) => (b.name || "").localeCompare(a.name || ""));
    } else if (sortBy === "code_asc") {
      list.sort((a, b) => (a.code || "").localeCompare(b.code || "", undefined, { numeric: true }));
    }

    return list;
  }, [customers, q, sortBy]);

  const totalDue = useMemo(() => {
    return filtered.reduce((sum, c) => sum + (c.total_amount - c.amount_received), 0);
  }, [filtered]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>

      <View style={styles.searchWrap}>
        <MaterialCommunityIcons name="magnify" size={18} color={colors.textMuted} />
        <TextInput
          testID="pp-search"
          style={styles.search}
          placeholder="Search customers with pending balance..."
          placeholderTextColor={colors.textLight}
          value={q}
          onChangeText={setQ}
        />
      </View>

      {/* Total Pending Balance Card */}
      {!loading && filtered.length > 0 && (
        <View style={styles.totalDueCard}>
          <View>
            <Text style={styles.totalDueLabel}>Total Outstanding</Text>
            <Text style={styles.totalDueValue}>₹{totalDue.toLocaleString("en-IN")}</Text>
          </View>
          <View style={styles.totalDueCount}>
            <Text style={styles.totalDueCountText}>{filtered.length} customers</Text>
          </View>
        </View>
      )}

      {/* Sort Options Bar */}
      {!loading && customers.length > 0 && (
        <View style={styles.sortBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortScroll}>
            <View style={styles.sortLabelWrap}>
              <MaterialCommunityIcons name="sort" size={13} color={colors.textMuted} />
              <Text style={styles.sortLabel}>SORT:</Text>
            </View>

            <TouchableOpacity
              testID="pp-sort-due-desc"
              style={[styles.sortChip, sortBy === "due_desc" && styles.sortChipActive]}
              onPress={() => setSortBy("due_desc")}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="arrow-down"
                size={13}
                color={sortBy === "due_desc" ? "#fff" : colors.textMuted}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.sortChipText, sortBy === "due_desc" && styles.sortChipTextActive]}>
                Highest Due
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="pp-sort-due-asc"
              style={[styles.sortChip, sortBy === "due_asc" && styles.sortChipActive]}
              onPress={() => setSortBy("due_asc")}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="arrow-up"
                size={13}
                color={sortBy === "due_asc" ? "#fff" : colors.textMuted}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.sortChipText, sortBy === "due_asc" && styles.sortChipTextActive]}>
                Lowest Due
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="pp-sort-name-asc"
              style={[styles.sortChip, sortBy === "name_asc" && styles.sortChipActive]}
              onPress={() => setSortBy("name_asc")}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="sort-alphabetical-ascending"
                size={13}
                color={sortBy === "name_asc" ? "#fff" : colors.textMuted}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.sortChipText, sortBy === "name_asc" && styles.sortChipTextActive]}>
                Customer (A-Z)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="pp-sort-name-desc"
              style={[styles.sortChip, sortBy === "name_desc" && styles.sortChipActive]}
              onPress={() => setSortBy("name_desc")}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="sort-alphabetical-descending"
                size={13}
                color={sortBy === "name_desc" ? "#fff" : colors.textMuted}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.sortChipText, sortBy === "name_desc" && styles.sortChipTextActive]}>
                Customer (Z-A)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="pp-sort-code-asc"
              style={[styles.sortChip, sortBy === "code_asc" && styles.sortChipActive]}
              onPress={() => setSortBy("code_asc")}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="numeric"
                size={13}
                color={sortBy === "code_asc" ? "#fff" : colors.textMuted}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.sortChipText, sortBy === "code_asc" && styles.sortChipTextActive]}>
                Code
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: 100 }}>
          {filtered.length === 0 && (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="check-circle-outline" size={44} color={colors.success} />
              <Text style={styles.emptyText}>No pending balances</Text>
            </View>
          )}
          {filtered.map(c => {
            const balance = c.total_amount - c.amount_received;
            return (
              <TouchableOpacity
                key={c.id}
                testID={`pp-item-${c.id}`}
                style={styles.item}
                activeOpacity={0.85}
                onPress={() => router.push({
                  pathname: "/payment-form",
                  params: {
                    customer_id: c.id,
                    branch_id: c.branch_id,
                    suggest_amount: balance.toFixed(0)
                  }
                })}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(c.name || "?").slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{c.name}</Text>
                  <Text style={styles.meta}>{c.code} · {c.village} · Bill ₹{c.total_amount?.toFixed(0)} · Paid ₹{c.amount_received?.toFixed(0)}</Text>
                </View>
                <View style={styles.balance}>
                  <Text style={styles.balanceLabel}>Due</Text>
                  <Text style={styles.balanceValue}>₹{balance.toFixed(0)}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <TouchableOpacity
        testID="pp-advance-add"
        style={styles.fab}
        onPress={() => router.push("/payment-form")}
        activeOpacity={0.85}
      >
        <MaterialCommunityIcons name="wallet-plus-outline" size={24} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: spacing.xl, backgroundColor: colors.card, borderRadius: radius.lg, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border },
  search: { flex: 1, paddingVertical: 12, fontSize: 14, color: colors.text },
  item: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, padding: spacing.md, borderRadius: radius.xl, gap: spacing.md, ...shadow.card },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.accent + "20", alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 17, fontWeight: "800", color: colors.accent },
  name: { fontSize: 15, fontWeight: "800", color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  balance: { alignItems: "flex-end" },
  balanceLabel: { fontSize: 10, color: colors.textMuted, fontWeight: "800", letterSpacing: 0.3, textTransform: "uppercase" },
  balanceValue: { fontSize: 17, color: colors.accent, fontWeight: "800", marginTop: 2 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 6 },
  emptyText: { fontSize: 14, color: colors.textMuted, fontWeight: "700", marginTop: 8 },
  fab: {
    position: "absolute",
    right: spacing.xl,
    bottom: spacing.xl + 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.fab,
  },
  totalDueCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: `${colors.primary}12`,
    borderColor: `${colors.primary}30`,
    borderWidth: 1,
    marginHorizontal: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.xl,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  totalDueLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  totalDueValue: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.primary,
    marginTop: 2,
  },
  totalDueCount: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  totalDueCountText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  sortBar: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  sortScroll: {
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    gap: 8,
  },
  sortLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginRight: 2,
  },
  sortLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  sortChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  sortChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sortChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
  },
  sortChipTextActive: {
    color: "#fff",
  },
});
