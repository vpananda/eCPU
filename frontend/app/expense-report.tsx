import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import { Input } from "@/src/components/Input";
import { Picker } from "@/src/components/Picker";
import { colors, radius, shadow, spacing } from "@/src/theme";

const CAT_ICONS: Record<string, string> = {
  Electricity: "lightning-bolt", Diesel: "gas-station", "Machine Maintenance": "wrench",
  Repair: "hammer-wrench", Transport: "truck", Packing: "package-variant",
  Salary: "account-cash", Tea: "coffee", "Office Expense": "briefcase", Miscellaneous: "dots-horizontal",
};

function firstOfCurrentMonthISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function ExpenseReportScreen() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";

  const [start, setStart] = useState(firstOfCurrentMonthISO());
  const [end, setEnd] = useState(todayISO());
  const [branchId, setBranchId] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);

  const [branches, setBranches] = useState<any[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  // Load masters
  useEffect(() => {
    Promise.all([
      api<string[]>("/expense-categories"),
      isAdmin ? api<any[]>("/branches") : Promise.resolve([]),
    ])
      .then(([c, b]) => {
        setCats(c);
        setBranches(b);
        if (!isAdmin && user?.branch_id) {
          setBranchId(user.branch_id);
        }
      })
      .catch(e => toast.show(e.message || "Failed to load filters", "error"));
  }, [isAdmin, user]);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      let url = `/expenses?start=${start}&end=${end}`;
      if (branchId) url += `&branch_id=${branchId}`;
      const data = await api<any[]>(url);
      setExpenses(data);
    } catch (e: any) {
      toast.show(e.message || "Failed to fetch expenses", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [start, end, branchId, toast]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Filter local data by category
  const filteredExpenses = expenses.filter(e => !category || e.category === category);
  const totalAmount = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Category wise totals for chart list
  const categorySummary = Object.entries(
    filteredExpenses.reduce((acc: Record<string, number>, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="expense-report-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Expense Report</Text>
        <TouchableOpacity testID="expense-report-refresh" onPress={loadData}>
          <MaterialCommunityIcons name="refresh" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Filters Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Report Filters</Text>
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <Input
                testID="report-start-date"
                label="From Date"
                placeholder="YYYY-MM-DD"
                value={start}
                onChangeText={setStart}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                testID="report-end-date"
                label="To Date"
                placeholder="YYYY-MM-DD"
                value={end}
                onChangeText={setEnd}
              />
            </View>
          </View>

          {isAdmin && (
            <Picker
              testID="report-branch"
              label="Branch"
              placeholder="All Branches"
              value={branchId}
              onChange={setBranchId}
              options={[{ id: "", name: "All Branches" }, ...branches.map(b => ({ id: b.id, name: b.name }))]}
            />
          )}

          <Picker
            testID="report-category"
            label="Ledger Category"
            placeholder="All Categories"
            value={category}
            onChange={setCategory}
            options={[{ id: "", name: "All Categories" }, ...cats.map(c => ({ id: c, name: c }))]}
          />
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 20 }} color={colors.primary} />
        ) : (
          <>
            {/* KPI Card */}
            <View style={styles.totalCard}>
              <View>
                <Text style={styles.totalLabel}>Total Expenses</Text>
                <Text style={styles.totalValue}>₹{totalAmount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</Text>
                <Text style={styles.totalSub}>{filteredExpenses.length} transaction entries</Text>
              </View>
              <MaterialCommunityIcons name="chart-pie" size={40} color="#fff" />
            </View>

            {/* Category Breakdown */}
            {categorySummary.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Breakdown by Category</Text>
                {categorySummary.map(([cat, amt]) => {
                  const percentage = totalAmount > 0 ? (amt / totalAmount) * 100 : 0;
                  return (
                    <View key={cat} style={styles.breakdownRow}>
                      <View style={styles.breakdownHeader}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <MaterialCommunityIcons name={(CAT_ICONS[cat] as any) || "cash"} size={16} color={colors.primary} />
                          <Text style={styles.breakdownName}>{cat}</Text>
                        </View>
                        <Text style={styles.breakdownVal}>₹{amt.toLocaleString("en-IN")} ({percentage.toFixed(0)}%)</Text>
                      </View>
                      <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: `${percentage}%` }]} />
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Expenses List */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Transactions</Text>
              {filteredExpenses.length === 0 ? (
                <Text style={styles.empty}>No expenses match the selected filters.</Text>
              ) : (
                filteredExpenses.map(item => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.itemRow}
                    onPress={() => router.push(`/expense-form?id=${item.id}`)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.iconWrap}>
                      <MaterialCommunityIcons name={(CAT_ICONS[item.category] as any) || "cash"} size={20} color={colors.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemCategory}>{item.category}</Text>
                      {item.vendor ? <Text style={styles.itemVendor}>Vendor: {item.vendor}</Text> : null}
                      {item.remarks ? <Text style={styles.itemRemarks} numberOfLines={1}>{item.remarks}</Text> : null}
                      <Text style={styles.itemDate}>{new Date(item.expense_date || item.created_at).toLocaleDateString("en-IN")}</Text>
                      
                      {/* Photo Previews */}
                      {item.bill_photos && item.bill_photos.length > 0 && (
                        <View style={styles.photoThumbnails}>
                          {item.bill_photos.map((p: string, idx: number) => (
                            <TouchableOpacity key={idx} onPress={() => setPreviewPhoto(p)}>
                              <Image source={{ uri: p }} style={styles.thumbImage} />
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                    <Text style={styles.itemAmount}>₹{item.amount.toFixed(2)}</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Image Preview Modal */}
      <Modal transparent visible={!!previewPhoto} onRequestClose={() => setPreviewPhoto(null)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setPreviewPhoto(null)}>
          <View style={styles.modalContent}>
            {previewPhoto && <Image source={{ uri: previewPhoto }} style={styles.previewImage} resizeMode="contain" />}
            <TouchableOpacity style={styles.closeBtn} onPress={() => setPreviewPhoto(null)}>
              <MaterialCommunityIcons name="close-circle" size={40} color="#fff" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  scroll: { padding: spacing.xl, gap: spacing.lg, paddingBottom: 120 },
  card: { backgroundColor: colors.card, padding: spacing.lg, borderRadius: radius.xl, ...shadow.card },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: colors.textMuted, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: spacing.md },
  dateRow: { flexDirection: "row", gap: spacing.md, marginBottom: -10 },
  totalCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.primary, padding: spacing.xl, borderRadius: radius.xxl, ...shadow.card },
  totalLabel: { color: "#C8E6C9", fontSize: 12, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  totalValue: { color: "#fff", fontSize: 28, fontWeight: "800", marginTop: 4 },
  totalSub: { color: "#C8E6C9", fontSize: 12, marginTop: 2 },
  breakdownRow: { marginVertical: 8 },
  breakdownHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  breakdownName: { fontSize: 13, fontWeight: "700", color: colors.text },
  breakdownVal: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  progressBar: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.primary, borderRadius: 3 },
  empty: { textAlign: "center", color: colors.textMuted, paddingVertical: spacing.xl },
  itemRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  iconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent + "20", alignItems: "center", justifyContent: "center" },
  itemCategory: { fontSize: 14, fontWeight: "700", color: colors.text },
  itemVendor: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  itemRemarks: { fontSize: 11, color: colors.textLight, marginTop: 1, fontStyle: "italic" },
  itemDate: { fontSize: 10, color: colors.textLight, marginTop: 2 },
  itemAmount: { fontSize: 15, fontWeight: "800", color: colors.accent },
  photoThumbnails: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.sm },
  thumbImage: { width: 40, height: 40, borderRadius: radius.xs, borderWidth: 1, borderColor: colors.border },
  
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", justifyContent: "center", alignItems: "center" },
  modalContent: { width: "90%", height: "80%", justifyContent: "center", alignItems: "center" },
  previewImage: { width: "100%", height: "100%" },
  closeBtn: { position: "absolute", top: 20, right: 20 },
});
