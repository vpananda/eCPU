import React, { useCallback, useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Modal, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Picker } from "@/src/components/Picker";
import Calendar from "@/src/components/Calendar";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { ScrollView } from "react-native";

const CAT_ICONS: Record<string, string> = {
  Electricity: "lightning-bolt", Diesel: "gas-station", "Machine Maintenance": "wrench",
  Repair: "hammer-wrench", Transport: "truck", Packing: "package-variant",
  Salary: "account-cash", Tea: "coffee", "Office Expense": "briefcase", Miscellaneous: "dots-horizontal",
  "Processing Wages": "account-cash", EB: "lightning-bolt", "Operational Cost": "cash-register",
  "Building Expenses": "office-building", "Diwali Bonus": "gift", Chemicals: "flask", "Packaging Material": "package-variant"
};

function todayISO() { return new Date().toISOString().slice(0, 10); }
function monthStartISO() {
  const d = new Date(); d.setDate(1);
  return d.toISOString().slice(0, 10);
}

const DATE_PRESETS = [
  { key: "all", label: "All" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "month", label: "This Month" },
  { key: "fy_25_26", label: "25-26" },
  { key: "fy_26_27", label: "26-27" },
];

export default function ExpensesScreen() {
  const router = useRouter();
  const { user, selectedBranchId } = useAuth();

  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedLedger, setSelectedLedger] = useState<any>(null);
  const [draftStart, setDraftStart] = useState<string>("");
  const [draftEnd, setDraftEnd] = useState<string>("");
  const [viewMode, setViewMode] = useState<"grouped" | "detailed">("grouped");
  const [activePreset, setActivePreset] = useState("all");

  const applyPreset = (key: string) => {
    setActivePreset(key);
    const today = new Date();
    let s = "";
    let e = "";

    if (key === "today") {
      s = todayISO();
      e = todayISO();
    } else if (key === "yesterday") {
      const d = new Date();
      d.setDate(today.getDate() - 1);
      s = d.toISOString().slice(0, 10);
      e = s;
    } else if (key === "month") {
      s = monthStartISO();
      e = todayISO();
    } else if (key === "fy_25_26") {
      s = "2025-04-01";
      e = "2026-03-31";
    } else if (key === "fy_26_27") {
      s = "2026-04-01";
      e = "2027-03-31";
    }

    setStartDate(s);
    setEndDate(e);
  };

  const load = useCallback(async () => {
    try {
      let url = "/expenses?";
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
  }, [selectedBranchId, startDate, endDate]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const total = list.reduce((s, e) => s + e.amount, 0);

  const groupedList = useMemo(() => {
    const groups: Record<string, { category: string; total: number; count: number; items: any[] }> = {};
    for (const item of list) {
      const cat = item.category || "Miscellaneous";
      if (!groups[cat]) {
        groups[cat] = { category: cat, total: 0, count: 0, items: [] };
      }
      groups[cat].total += item.amount;
      groups[cat].count += 1;
      groups[cat].items.push(item);
    }
    return Object.values(groups).sort((a, b) => a.category.localeCompare(b.category));
  }, [list]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>

      <View style={styles.dateFilterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateScroll}>
          {DATE_PRESETS.map(p => (
            <TouchableOpacity
              key={p.key}
              onPress={() => applyPreset(p.key)}
              style={[styles.datePill, activePreset === p.key && styles.datePillActive]}
              activeOpacity={0.8}
            >
              <Text style={[styles.datePillText, activePreset === p.key && styles.datePillTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={() => {
              setActivePreset("custom");
              setDraftStart(startDate);
              setDraftEnd(endDate);
              setPickerOpen(true);
            }}
            style={[styles.datePill, activePreset === "custom" && styles.datePillActive]}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="calendar-range" size={14} color={activePreset === "custom" ? "#fff" : colors.textMuted} style={{ marginRight: 4 }} />
            <Text style={[styles.datePillText, activePreset === "custom" && styles.datePillTextActive]}>
              {startDate && endDate ? `${startDate} to ${endDate}` : "Custom"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
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



      {/* View Mode Toggle Segmented Control */}
      <View style={styles.toggleContainer}>
        <TouchableOpacity
          testID="mode-grouped"
          style={[styles.toggleBtn, viewMode === "grouped" && styles.toggleBtnActive]}
          onPress={() => setViewMode("grouped")}
        >
          <MaterialCommunityIcons name="view-dashboard-outline" size={18} color={viewMode === "grouped" ? "#fff" : colors.textMuted} />
          <Text style={[styles.toggleText, viewMode === "grouped" && styles.toggleTextActive]}>Grouped</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="mode-detailed"
          style={[styles.toggleBtn, viewMode === "detailed" && styles.toggleBtnActive]}
          onPress={() => setViewMode("detailed")}
        >
          <MaterialCommunityIcons name="format-list-bulleted" size={18} color={viewMode === "detailed" ? "#fff" : colors.textMuted} />
          <Text style={[styles.toggleText, viewMode === "detailed" && styles.toggleTextActive]}>Detailed</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={viewMode === "grouped" ? groupedList : list}
          keyExtractor={i => viewMode === "grouped" ? i.category : i.id}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120, gap: spacing.sm }}
          ListEmptyComponent={<Text style={styles.empty}>No expenses. Tap + to add.</Text>}
          renderItem={({ item }) => {
            if (viewMode === "grouped") {
              return (
                <TouchableOpacity
                  testID={`expense-item-${item.category.replace(/\s+/g, "-").toLowerCase()}`}
                  style={styles.item}
                  onPress={() => {
                    setSelectedLedger(item);
                    setDetailsModalOpen(true);
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.icon}>
                    <MaterialCommunityIcons name={(CAT_ICONS[item.category] as any) || "cash"} size={20} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={styles.category}>{item.category}</Text>
                      <View style={styles.branchBadge}>
                        <Text style={styles.branchBadgeText}>{item.count} entries</Text>
                      </View>
                    </View>
                    <Text style={styles.date}>Group Total Ledger</Text>
                  </View>
                  <Text style={styles.amount}>₹{item.total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</Text>
                </TouchableOpacity>
              );
            } else {
              return (
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
                    {item.remarks ? <Text style={styles.vendor} numberOfLines={1}>{item.remarks}</Text> : null}
                    <Text style={styles.date}>{new Date(item.expense_date || item.created_at).toLocaleDateString("en-IN")}</Text>
                  </View>
                  <Text style={styles.amount}>₹{item.amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</Text>
                </TouchableOpacity>
              );
            }
          }}
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

      {/* Ledger Details Modal */}
      <Modal
        visible={detailsModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setDetailsModalOpen(false)}
      >
        <View style={styles.dateModalBg}>
          <View style={[styles.pickerSheet, { height: "80%", paddingBottom: 20 }]}>
            <View style={styles.pickerSheetHandle} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickerSheetTitle} numberOfLines={1}>{selectedLedger?.category}</Text>
                <Text style={{ fontSize: 13, color: colors.textMuted, fontWeight: "600" }}>
                  {selectedLedger?.count} entries · Total: ₹{selectedLedger?.total?.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </Text>
              </View>
              <TouchableOpacity testID="ledger-details-close" onPress={() => setDetailsModalOpen(false)} style={{ padding: 4 }}>
                <MaterialCommunityIcons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={selectedLedger?.items || []}
              keyExtractor={item => item.id}
              contentContainerStyle={{ gap: spacing.md, paddingBottom: 40 }}
              renderItem={({ item }) => (
                <View style={styles.ledgerItem}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <Text style={styles.ledgerRemarks}>{item.remarks || "No remarks"}</Text>
                      <TouchableOpacity
                        testID={`ledger-edit-${item.id}`}
                        onPress={() => {
                          setDetailsModalOpen(false);
                          setTimeout(() => {
                            router.push(`/expense-form?id=${item.id}`);
                          }, 100);
                        }}
                        style={styles.ledgerEditBtn}
                      >
                        <MaterialCommunityIcons name="pencil" size={16} color={colors.primary} />
                      </TouchableOpacity>
                    </View>
                    {item.vendor ? <Text style={styles.ledgerVendor}>{item.vendor}</Text> : null}
                    <Text style={styles.ledgerDate}>
                      {new Date(item.expense_date || item.created_at).toLocaleDateString("en-IN")}
                    </Text>
                  </View>
                  <Text style={styles.ledgerAmount}>₹{item.amount.toFixed(0)}</Text>
                </View>
              )}
            />
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
  ledgerItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.bg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ledgerRemarks: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    flex: 1,
    marginRight: spacing.sm,
  },
  ledgerVendor: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  ledgerDate: {
    fontSize: 11,
    color: colors.textLight,
    marginTop: 4,
  },
  ledgerAmount: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.danger,
    marginLeft: spacing.md,
  },
  ledgerEditBtn: {
    padding: 4,
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleContainer: {
    flexDirection: "row",
    backgroundColor: "#E4E9E6",
    borderRadius: radius.pill,
    marginHorizontal: spacing.xl,
    padding: 4,
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: radius.pill,
    gap: 6,
  },
  toggleBtnActive: {
    backgroundColor: colors.primary,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
  },
  toggleTextActive: {
    color: "#fff",
    fontWeight: "700",
  },
  dateFilterContainer: {
    paddingVertical: spacing.md,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.sm,
  },
  dateScroll: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  datePill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
  },
  datePillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  datePillText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
  },
  datePillTextActive: {
    color: "#ffffff",
    fontWeight: "700",
  },
});
