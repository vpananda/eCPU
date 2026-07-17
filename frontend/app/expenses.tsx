import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Picker } from "@/src/components/Picker";
import { colors, radius, shadow, spacing } from "@/src/theme";

const CAT_ICONS: Record<string, string> = {
  Electricity: "lightning-bolt", Diesel: "gas-station", "Machine Maintenance": "wrench",
  Repair: "hammer-wrench", Transport: "truck", Packing: "package-variant",
  Salary: "account-cash", Tea: "coffee", "Office Expense": "briefcase", Miscellaneous: "dots-horizontal",
};

export default function ExpensesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";

  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("");

  useEffect(() => {
    if (isAdmin) {
      api<any[]>("/branches")
        .then(setBranches)
        .catch(() => {});
    }
  }, [isAdmin]);

  const load = useCallback(async () => {
    try {
      let url = "/expenses";
      if (selectedBranch) {
        url += `?branch_id=${selectedBranch}`;
      }
      setList(await api<any[]>(url));
    } finally {
      setLoading(false);
    }
  }, [selectedBranch]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const total = list.reduce((s, e) => s + e.amount, 0);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="expenses-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Expenses</Text>
        <TouchableOpacity testID="expenses-add" style={styles.addBtn} onPress={() => router.push("/expense-form")}>
          <MaterialCommunityIcons name="plus" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.totalCard}>
        <View>
          <Text style={styles.totalLabel}>Total Expenses</Text>
          <Text style={styles.totalValue}>₹{total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</Text>
          <Text style={styles.totalSub}>{list.length} entries</Text>
        </View>
        <MaterialCommunityIcons name="cash-minus" size={40} color="#fff" />
      </View>

      {isAdmin && (
        <View style={styles.filterContainer}>
          <Picker
            testID="expenses-branch-filter"
            placeholder="All Branches"
            value={selectedBranch}
            onChange={setSelectedBranch}
            options={[{ id: "", name: "All Branches" }, ...branches.map(b => ({ id: b.id, name: b.name }))]}
          />
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120, gap: spacing.sm }}
          ListEmptyComponent={<Text style={styles.empty}>No expenses. Tap + to add.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`expense-item-${item.id}`}
              style={styles.item}
              onPress={() => router.push(`/expense-form?id=${item.id}`)}
              activeOpacity={0.85}
            >
              <View style={styles.icon}>
                <MaterialCommunityIcons name={(CAT_ICONS[item.category] as any) || "cash"} size={20} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={styles.category}>{item.category}</Text>
                  {item.branch_name ? (
                    <View style={styles.branchBadge}>
                      <Text style={styles.branchBadgeText}>{item.branch_name}</Text>
                    </View>
                  ) : null}
                </View>
                {item.vendor ? <Text style={styles.vendor}>{item.vendor}</Text> : null}
                <Text style={styles.date}>{new Date(item.expense_date || item.created_at).toLocaleDateString("en-IN")}</Text>
              </View>
              <Text style={styles.amount}>₹{item.amount.toFixed(2)}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  addBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  totalCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.accent, marginHorizontal: spacing.xl, padding: spacing.xl, borderRadius: radius.xxl, ...shadow.card },
  totalLabel: { color: "#FFE0B2", fontSize: 12, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  totalValue: { color: "#fff", fontSize: 28, fontWeight: "800", marginTop: 4 },
  totalSub: { color: "#FFE0B2", fontSize: 12, marginTop: 2 },
  filterContainer: { paddingHorizontal: spacing.xl, marginTop: spacing.md, marginBottom: -spacing.sm },
  item: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, padding: spacing.md, borderRadius: radius.lg, gap: spacing.md, ...shadow.card },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent + "20", alignItems: "center", justifyContent: "center" },
  category: { fontSize: 15, fontWeight: "700", color: colors.text },
  branchBadge: { backgroundColor: colors.primary50, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
  branchBadgeText: { fontSize: 10, color: colors.primary, fontWeight: "800" },
  vendor: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  date: { fontSize: 11, color: colors.textLight, marginTop: 1 },
  amount: { fontSize: 16, fontWeight: "800", color: colors.accent },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
});
