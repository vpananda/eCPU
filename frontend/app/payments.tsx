import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Modal, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import Calendar from "@/src/components/Calendar";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { useAuth } from "@/src/auth";

const MODE_COLORS: Record<string, string> = {
  Cash: "#43A047", UPI: "#7B1FA2", Bank: "#1565C0", Credit: "#F57C00",
};

export default function PaymentsScreen() {
  const router = useRouter();
  const { selectedBranchId } = useAuth();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftStart, setDraftStart] = useState<string>("");
  const [draftEnd, setDraftEnd] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let url = "/payments?";
      const params = [];
      if (selectedBranchId) {
        params.push(`branch_id=${selectedBranchId}`);
      }
      if (startDate) {
        params.push(`start=${startDate}`);
      }
      if (endDate) {
        params.push(`end=${endDate}`);
      }
      url += params.join("&");
      const d = await api<any[]>(url);
      d.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setList(d);
    } catch (err) {
      // ignore
    } finally { setLoading(false); }
  }, [startDate, endDate, selectedBranchId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filteredList = React.useMemo(() => {
    if (!searchQuery) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(item => {
      const name = (item.customer_name || "").toLowerCase();
      const batch = (item.batch_no || "").toLowerCase();
      return name.includes(q) || batch.includes(q);
    });
  }, [list, searchQuery]);

  const total = filteredList.reduce((s, p) => s + p.amount, 0);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>

      <View style={styles.dateFilterWrapper}>
        <TouchableOpacity
          testID="payments-date-filter"
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
              testID="payments-clear-date"
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

      {/* Customer Name Search Bar */}
      <View style={styles.searchWrap}>
        <MaterialCommunityIcons name="magnify" size={20} color={colors.textMuted} />
        <TextInput
          testID="payments-search-input"
          style={styles.searchInput}
          placeholder="Search by customer name or batch no..."
          placeholderTextColor={colors.textLight}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <MaterialCommunityIcons name="close-circle" size={18} color={colors.textLight} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.totalCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.totalLabel}>Total Collected</Text>
          <Text style={styles.totalValue}>₹{total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
            <Text style={styles.totalSub}>{filteredList.length} payments</Text>
            {startDate && endDate ? (
              <Text style={styles.totalDateRange}>({startDate} - {endDate})</Text>
            ) : null}
          </View>
        </View>
        <MaterialCommunityIcons name="cash-multiple" size={40} color="#fff" />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={filteredList}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120, gap: spacing.sm }}
          ListEmptyComponent={<Text style={styles.empty}>No payments yet</Text>}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <View style={[styles.icon, { backgroundColor: `${MODE_COLORS[item.mode] || colors.primary}20` }]}>
                <MaterialCommunityIcons name="cash" size={20} color={MODE_COLORS[item.mode] || colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={styles.amount}>₹{item.amount.toFixed(2)}</Text>
                    <View style={[styles.modeChip, { backgroundColor: `${MODE_COLORS[item.mode]}20` }]}>
                      <Text style={[styles.modeText, { color: MODE_COLORS[item.mode] || colors.primary }]}>{item.mode}</Text>
                    </View>
                  </View>
                  {item.branch_name ? (
                    <View style={styles.branchBadge}>
                      <Text style={styles.branchBadgeText}>{item.branch_name}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.meta}>{item.customer_name || "-"} · {item.batch_no}</Text>
                <Text style={styles.date}>{new Date(item.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</Text>
              </View>
            </View>
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
                  testID="payments-start-date"
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
                  testID="payments-end-date"
                  style={styles.dateInput}
                  value={draftEnd}
                  onChangeText={setDraftEnd}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textLight}
                />
              </View>
            </View>

            <View style={styles.pickerSheetActions}>
              <TouchableOpacity testID="payments-range-cancel" style={styles.pickerSheetCancel} onPress={() => setPickerOpen(false)}>
                <Text style={styles.pickerSheetCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="payments-range-apply"
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  totalCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.primary, marginHorizontal: spacing.xl, padding: spacing.xl, borderRadius: radius.xxl, ...shadow.card },
  totalLabel: { color: "#B9F6CA", fontSize: 12, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  totalValue: { color: "#fff", fontSize: 28, fontWeight: "800", marginTop: 4 },
  totalSub: { color: "#E8F5E9", fontSize: 12, marginTop: 2 },
  item: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, padding: spacing.md, borderRadius: radius.lg, gap: spacing.md, ...shadow.card },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  amount: { fontSize: 16, fontWeight: "800", color: colors.text },
  modeChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  modeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  date: { fontSize: 11, color: colors.textLight, marginTop: 1 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  branchBadge: { backgroundColor: colors.primary50, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
  branchBadgeText: { fontSize: 10, color: colors.primary, fontWeight: "800" },
  filterContainer: { paddingHorizontal: spacing.xl, marginTop: spacing.md, marginBottom: -spacing.sm },
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
    color: "#E8F5E9",
    fontSize: 11,
    fontWeight: "600",
  },
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    marginHorizontal: spacing.xl, backgroundColor: colors.card,
    borderRadius: radius.lg, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: colors.text },
});
