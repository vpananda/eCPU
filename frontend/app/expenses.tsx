import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Modal, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Picker } from "@/src/components/Picker";
import Calendar from "@/src/components/Calendar";
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
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftStart, setDraftStart] = useState<string>("");
  const [draftEnd, setDraftEnd] = useState<string>("");

  useEffect(() => {
    if (isAdmin) {
      api<any[]>("/branches")
        .then(setBranches)
        .catch(() => {});
    }
  }, [isAdmin]);

  const load = useCallback(async () => {
    try {
      let url = "/expenses?";
      const params = [];
      if (selectedBranch) {
        params.push(`branch_id=${selectedBranch}`);
      }
      if (startDate) {
        params.push(`start=${startDate}`);
      }
      if (endDate) {
        params.push(`end=${endDate}`);
      }
      url += params.join("&");
      const data = await api<any[]>(url);
      data.sort((a, b) => {
        const dateA = new Date(a.expense_date || a.created_at);
        const dateB = new Date(b.expense_date || b.created_at);
        return dateB.getTime() - dateA.getTime();
      });
      setList(data);
    } catch (err) {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [selectedBranch, startDate, endDate]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const total = list.reduce((s, e) => s + e.amount, 0);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>

      <View style={styles.dateFilterWrapper}>
        <TouchableOpacity
          testID="expenses-date-filter"
          style={styles.dateFilterTrigger}
          onPress={() => {
            setDraftStart(startDate);
            setDraftEnd(endDate);
            setPickerOpen(true);
          }}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="calendar" size={18} color={colors.textMuted} />
          <Text style={startDate && endDate ? styles.dateFilterText : styles.dateFilterPlaceholder}>
            {startDate && endDate ? `${startDate} to ${endDate}` : "Filter by Date"}
          </Text>
          {startDate || endDate ? (
            <TouchableOpacity
              testID="expenses-clear-date"
              onPress={(e) => {
                e.stopPropagation();
                setStartDate("");
                setEndDate("");
              }}
              style={styles.clearDateBtn}
            >
              <MaterialCommunityIcons name="close-circle" size={16} color={colors.textLight} />
            </TouchableOpacity>
          ) : (
            <MaterialCommunityIcons name="chevron-down" size={20} color={colors.textMuted} />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.totalCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.totalLabel}>Total Expenses</Text>
          <Text style={styles.totalValue}>₹{total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
            <Text style={styles.totalSub}>{list.length} entries</Text>
            {startDate && endDate ? (
              <Text style={styles.totalDateRange}>({startDate} - {endDate})</Text>
            ) : null}
          </View>
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

      {/* Date Picker Modal */}
      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={styles.dateModalBg}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerSheetHandle} />
            <Text style={styles.pickerSheetTitle}>Select Date Range</Text>

            <Calendar
              startDate={draftStart}
              endDate={draftEnd}
              onSelectRange={(s, e) => {
                setDraftStart(s);
                setDraftEnd(e);
              }}
            />

            <View style={styles.dateRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dateLabel}>From</Text>
                <TextInput
                  testID="expenses-start-date"
                  style={styles.dateInput}
                  value={draftStart}
                  onChangeText={setDraftStart}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textLight}
                />
              </View>
              <MaterialCommunityIcons name="arrow-right" size={18} color={colors.textMuted} style={{ marginTop: 22 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.dateLabel}>To</Text>
                <TextInput
                  testID="expenses-end-date"
                  style={styles.dateInput}
                  value={draftEnd}
                  onChangeText={setDraftEnd}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textLight}
                />
              </View>
            </View>

            <View style={styles.pickerSheetActions}>
              <TouchableOpacity testID="expenses-range-cancel" style={styles.pickerSheetCancel} onPress={() => setPickerOpen(false)}>
                <Text style={styles.pickerSheetCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="expenses-range-apply"
                style={styles.pickerSheetApply}
                onPress={() => {
                  setStartDate(draftStart);
                  setEndDate(draftEnd);
                  setPickerOpen(false);
                }}
              >
                <Text style={styles.pickerSheetApplyText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <TouchableOpacity
        testID="expenses-add"
        style={styles.fab}
        onPress={() => router.push("/expense-form")}
        activeOpacity={0.85}
      >
        <MaterialCommunityIcons name="plus" size={24} color="#fff" />
      </TouchableOpacity>
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
  dateFilterTrigger: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  dateFilterText: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    fontWeight: "700",
  },
  dateFilterPlaceholder: {
    flex: 1,
    fontSize: 14,
    color: colors.textLight,
  },
  clearDateBtn: {
    padding: 2,
  },
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
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.lg,
    marginTop: spacing.md,
  },
  dateLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textMuted,
    marginBottom: 6,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  dateInput: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
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
  dateFilterWrapper: {
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  totalDateRange: {
    color: "#FFE0B2",
    fontSize: 11,
    fontWeight: "600",
  },
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
});
