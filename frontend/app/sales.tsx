import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import Calendar from "@/src/components/Calendar";
import { colors, radius, shadow, spacing } from "@/src/theme";

function todayISO() { return new Date().toISOString().slice(0, 10); }
function monthStartISO() {
  const d = new Date(); d.setDate(1);
  return d.toISOString().slice(0, 10);
}

export default function SalesScreen() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";
  const isManager = user?.role === "Manager";

  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(monthStartISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [draftStart, setDraftStart] = useState(monthStartISO());
  const [draftEnd, setDraftEnd] = useState(todayISO());
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let url = "/sales?";
      const params = [];
      if (startDate) params.push(`start=${startDate}`);
      if (endDate) params.push(`end=${endDate}`);
      url += params.join("&");
      
      const data = await api<any[]>(url);
      setList(data);
    } catch (err: any) {
      toast.show(err.message || "Failed to load sales", "error");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = (id: string) => {
    if (!isAdmin && !isManager) return;
    Alert.alert(
      "Delete Sale Record",
      "Are you sure you want to delete this sale? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await api(`/sales/${id}`, { method: "DELETE" });
              toast.show("Sale record deleted");
              load();
            } catch (e: any) {
              toast.show(e.message || "Failed to delete sale", "error");
            }
          }
        }
      ]
    );
  };

  const totalSales = list.reduce((sum, s) => sum + (s.amount || 0), 0);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Date Range Filter above Total Card */}
      <View style={styles.dateFilterWrapper}>
        <TouchableOpacity
          testID="sales-date-filter"
          style={styles.dateFilterTrigger}
          onPress={() => {
            setDraftStart(startDate);
            setDraftEnd(endDate);
            setPickerOpen(true);
          }}
        >
          <MaterialCommunityIcons name="calendar-range" size={18} color={colors.primary} style={{ marginRight: 6 }} />
          <Text style={styles.dateFilterText}>
            {startDate && endDate ? `${startDate} to ${endDate}` : "Select Date Range"}
          </Text>
          <MaterialCommunityIcons name="chevron-down" size={18} color={colors.textMuted} style={{ marginLeft: "auto" }} />
        </TouchableOpacity>
      </View>

      {/* Total Card */}
      <View style={styles.totalCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.totalLabel}>TOTAL SALES</Text>
          <Text style={styles.totalValue}>₹{totalSales.toLocaleString("en-IN")}</Text>
          <Text style={styles.totalSub}>
            {list.length} entries {startDate && endDate ? `(${startDate} - ${endDate})` : ""}
          </Text>
        </View>
        <MaterialCommunityIcons name="receipt" size={40} color="rgba(255,255,255,0.25)" />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120, gap: spacing.sm }}
          ListEmptyComponent={<Text style={styles.empty}>No sales records found.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`sale-item-${item.id}`}
              style={styles.item}
              onPress={() => handleDelete(item.id)}
              activeOpacity={0.85}
              disabled={!isAdmin && !isManager}
            >
              <View style={styles.iconWrap}>
                <MaterialCommunityIcons name="tag-outline" size={20} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={styles.category}>{item.item_name}</Text>
                  {item.branch_name ? (
                    <View style={styles.branchBadge}>
                      <Text style={styles.branchBadgeText}>{item.branch_name}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.vendor}>{item.customer_name || "—"}</Text>
                <Text style={styles.qty}>
                  {item.quantity.toFixed(2)} kg @ ₹{item.rate.toFixed(2)}/kg
                </Text>
                <Text style={styles.date}>{new Date(item.sale_date || item.created_at).toLocaleDateString("en-IN")}</Text>
              </View>
              <Text style={styles.amount}>₹{item.amount.toFixed(2)}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Floating Action Button */}
      <TouchableOpacity
        testID="sales-add-fab"
        style={styles.fab}
        onPress={() => router.push("/sale-form")}
        activeOpacity={0.85}
      >
        <MaterialCommunityIcons name="plus" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Calendar Range Selection Modal */}
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
                  testID="sales-start-date"
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
                  testID="sales-end-date"
                  style={styles.dateInput}
                  value={draftEnd}
                  onChangeText={setDraftEnd}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textLight}
                />
              </View>
            </View>

            <View style={styles.pickerSheetActions}>
              <TouchableOpacity testID="sales-range-cancel" style={styles.pickerSheetCancel} onPress={() => setPickerOpen(false)}>
                <Text style={styles.pickerSheetCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="sales-range-apply"
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
  dateFilterWrapper: { paddingHorizontal: spacing.xl, marginTop: spacing.sm, marginBottom: spacing.xs },
  dateFilterTrigger: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10 },
  dateFilterText: { fontSize: 13, fontWeight: "600", color: colors.text },
  totalCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.accent, margin: spacing.xl, marginTop: spacing.sm, padding: spacing.lg, borderRadius: radius.xl, ...shadow.card },
  totalLabel: { fontSize: 11, fontWeight: "800", color: "#FFE0B2", letterSpacing: 0.5 },
  totalValue: { fontSize: 32, fontWeight: "800", color: "#fff", marginTop: 4, letterSpacing: -0.5 },
  totalSub: { fontSize: 11, color: "#FFE0B2", marginTop: 4, fontWeight: "500" },
  empty: { textAlign: "center", color: colors.textMuted, paddingVertical: spacing.xl },
  item: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, padding: spacing.md, borderRadius: radius.lg, gap: spacing.md, ...shadow.card },
  iconWrap: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accent + "18", alignItems: "center", justifyContent: "center" },
  category: { fontSize: 15, fontWeight: "800", color: colors.text },
  branchBadge: { backgroundColor: colors.primary50, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
  branchBadgeText: { fontSize: 10, color: colors.primary, fontWeight: "800" },
  vendor: { fontSize: 13, color: colors.textMuted, marginTop: 2, fontWeight: "600" },
  qty: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  date: { fontSize: 10, color: colors.textLight, marginTop: 4 },
  amount: { fontSize: 17, fontWeight: "800", color: colors.accent },
  fab: { position: "absolute", right: spacing.xl, bottom: spacing.xl + 20, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", ...shadow.fab },
  
  // Calendar Modal Styles
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
    fontWeight: "700",
  },
});
