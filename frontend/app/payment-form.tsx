import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, ActivityIndicator, Modal, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { storage } from "@/src/utils/storage";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import { Input } from "@/src/components/Input";
import { Button } from "@/src/components/Button";
import { Picker } from "@/src/components/Picker";
import { colors, radius, shadow, spacing } from "@/src/theme";
import Calendar from "@/src/components/Calendar";
import { openWhatsApp, openSMS, buildPaymentReceiptMessage } from "@/src/utils/notifications";


const MODES = ["Cash", "UPI", "Bank", "Credit"];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatFriendlyDate(isoStr: string) {
  if (!isoStr) return "Select date";
  try {
    const parts = isoStr.split("-");
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString("en-IN", {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        });
      }
    }
  } catch {}
  return isoStr;
}

type CustomerStats = {
  total_visits: number;
  total_weight: number;
  total_revenue: number;
  total_paid: number;
  pending_balance: number;
  name?: string;
  code?: string;
  mobile?: string;
};

export default function PaymentForm() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    customer_id?: string;
    branch_id?: string;
    suggest_amount?: string;
    batch_id?: string;
  }>();
  const toast = useToast();
  const { user, branches } = useAuth();

  const isAdmin = user?.role === "Admin";

  const [customers, setCustomers] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [customerStats, setCustomerStats] = useState<CustomerStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("Cash");
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [tempDate, setTempDate] = useState(todayISO());
  const [remarks, setRemarks] = useState("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [targetPhone, setTargetPhone] = useState("");

  useEffect(() => {
    if (params.customer_id) setCustomerId(params.customer_id);
    if (params.branch_id) setBranchId(params.branch_id);
    if (params.suggest_amount) setAmount(params.suggest_amount);
  }, [params.customer_id, params.branch_id, params.suggest_amount]);

  const displayBranches = isAdmin
    ? branches
    : branches.filter(b => b.id === user?.branch_id);

  useEffect(() => {
    if (displayBranches.length && !branchId) {
      if (isAdmin && user?.branch_id) {
        setBranchId(user.branch_id);
      } else if (!isAdmin) {
        setBranchId(displayBranches[0].id);
      }
    }
  }, [displayBranches, isAdmin, user]);

  // Load customer list
  useEffect(() => {
    async function loadCustomers() {
      const cached = await storage.getItem<any[]>("cached_customers", []);
      if (cached && cached.length > 0) {
        setCustomers(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
      try {
        const list = await api<any[]>("/customers?lite=true");
        setCustomers(list);
        storage.setItem("cached_customers", list);
      } catch (e: any) {
        if (!cached || cached.length === 0) {
          toast.show(e.message || "Failed to load customers", "error");
        }
      } finally {
        setLoading(false);
      }
    }
    loadCustomers();
  }, []);

  // Filter customers by selected branch
  const filteredCustomers = React.useMemo(() => {
    if (!branchId) return customers;
    return customers.filter(c => !c.branch_id || c.branch_id === branchId);
  }, [customers, branchId]);

  useEffect(() => {
    if (branchId && customerId) {
      const exists = filteredCustomers.some(c => c.id === customerId);
      if (!exists) {
        setCustomerId(null);
      }
    }
  }, [branchId, customerId, filteredCustomers]);

  // Load customer financial summary & ledger stats when customer is selected
  useEffect(() => {
    if (customerId) {
      setLoadingStats(true);
      api<any>(`/customers/${customerId}`)
        .then(c => {
          const st = c.stats || {};
          setCustomerStats({
            total_visits: st.total_visits || 0,
            total_weight: st.total_weight || 0,
            total_revenue: st.total_revenue || 0,
            total_paid: st.total_paid || 0,
            pending_balance: st.pending_balance || 0,
            name: c.name,
            code: c.code,
            mobile: c.mobile,
          });
        })
        .catch(() => {
          setCustomerStats(null);
        })
        .finally(() => {
          setLoadingStats(false);
        });
    } else {
      setCustomerStats(null);
    }
  }, [customerId]);

  const submit = async () => {
    const a = parseFloat(amount);
    if (!branchId) {
      toast.show("Select branch", "error");
      return;
    }
    if (!customerId) {
      toast.show("Select customer", "error");
      return;
    }
    if (!a || a <= 0) {
      toast.show("Enter valid amount", "error");
      return;
    }
    setSaving(true);
    try {
      await api("/payments", {
        method: "POST",
        body: {
          customer_id: customerId,
          branch_id: branchId,
          amount: a,
          mode,
          remarks,
          created_at: paymentDate ? `${paymentDate}T12:00:00Z` : undefined,
        },
      });
      toast.show("Payment recorded & WhatsApp receipt sent!");
      router.back();
    } catch (e: any) {
      toast.show(e.message || "Failed to save payment", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
            <Picker
              testID="payment-branch"
              label="Branch *"
              placeholder="Select branch"
              value={branchId}
              onChange={setBranchId}
              options={displayBranches.map(b => ({ id: b.id, name: b.name }))}
            />

            <Picker
              testID="payment-customer"
              label="Customer *"
              placeholder="Select customer"
              value={customerId}
              onChange={setCustomerId}
              options={filteredCustomers.map(c => ({ id: c.id, name: `${c.name} (${c.mobile || c.code})` }))}
            />

            {/* Customer Financial Ledger Summary Card */}
            {loadingStats ? (
              <View style={styles.statsLoadingBox}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.statsLoadingText}>Loading customer ledger summary...</Text>
              </View>
            ) : customerStats ? (
              <View style={styles.customerSummaryCard}>
                <View style={styles.summaryTopRow}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                    <MaterialCommunityIcons name="account-circle-outline" size={18} color={colors.primary} />
                    <Text style={styles.summaryCustTitle} numberOfLines={1}>
                      {customerStats.name} ({customerStats.code || customerStats.mobile || "Customer"})
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.ledgerLinkBtn}
                    onPress={() => router.push(`/customer/${customerId}`)}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons name="book-open-outline" size={13} color={colors.primary} />
                    <Text style={styles.ledgerLinkText}>View Ledger</Text>
                  </TouchableOpacity>
                </View>

                {/* 3 Metrics: Total Arrival, Received Amount, Balance Amount */}
                <View style={styles.summaryMetricsRow}>
                  {/* Total Arrival Bill */}
                  <View style={styles.summaryMetricItem}>
                    <Text style={styles.metricLabel}>Total Arrival</Text>
                    <Text style={styles.metricValue}>₹{customerStats.total_revenue.toLocaleString("en-IN")}</Text>
                    <Text style={styles.metricSub}>
                      {customerStats.total_weight.toLocaleString("en-IN")} KG • {customerStats.total_visits} arrivals
                    </Text>
                  </View>

                  <View style={styles.metricDivider} />

                  {/* Received Amount */}
                  <View style={styles.summaryMetricItem}>
                    <Text style={styles.metricLabel}>Received Amount</Text>
                    <Text style={[styles.metricValue, { color: colors.success }]}>
                      ₹{customerStats.total_paid.toLocaleString("en-IN")}
                    </Text>
                    <Text style={styles.metricSub}>Total Collected</Text>
                  </View>

                  <View style={styles.metricDivider} />

                  {/* Balance Amount */}
                  <View style={styles.summaryMetricItem}>
                    <Text style={styles.metricLabel}>Balance Amount</Text>
                    <Text
                      style={[
                        styles.metricValue,
                        customerStats.pending_balance > 0 ? { color: colors.danger } : { color: colors.success },
                      ]}
                    >
                      ₹{Math.abs(customerStats.pending_balance).toLocaleString("en-IN")}
                    </Text>
                    <Text style={[styles.metricSub, customerStats.pending_balance > 0 && { color: colors.danger, fontWeight: "700" }]}>
                      {customerStats.pending_balance > 0 ? "Pending Due" : "Advance Credit"}
                    </Text>
                  </View>
                </View>

                {/* Quick Autofill Exact Balance Button */}
                {customerStats.pending_balance > 0 && (
                  <TouchableOpacity
                    style={styles.autofillBtn}
                    onPress={() => setAmount(String(customerStats.pending_balance))}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons name="lightning-bolt" size={14} color={colors.primary} />
                    <Text style={styles.autofillBtnText}>
                      Autofill Balance: ₹{customerStats.pending_balance.toLocaleString("en-IN")}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}

            <Input
              testID="payment-amount"
              label="Amount (₹) *"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
            />

            {/* Real-Time Balance Calculator */}
            {customerStats && parseFloat(amount) > 0 && (
              <View style={styles.calcBox}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <MaterialCommunityIcons name="calculator-variant-outline" size={15} color={colors.primary} />
                  <Text style={styles.calcLabel}>Account Impact After Payment:</Text>
                </View>
                {customerStats.pending_balance - parseFloat(amount) > 0 ? (
                  <Text style={styles.calcResultPending}>
                    Remaining Balance Due: ₹{(customerStats.pending_balance - parseFloat(amount)).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </Text>
                ) : customerStats.pending_balance - parseFloat(amount) === 0 ? (
                  <Text style={styles.calcResultCleared}>
                    ✓ Balance will be FULLY CLEARED (₹0.00)
                  </Text>
                ) : (
                  <Text style={styles.calcResultAdvance}>
                    ✓ Advance Credit for Next Arrival: ₹{(parseFloat(amount) - customerStats.pending_balance).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </Text>
                )}
              </View>
            )}

            {/* Payment Date with Calendar Picker */}
            <View style={{ marginBottom: spacing.md }}>
              <Text style={styles.label}>Payment Date *</Text>
              <TouchableOpacity
                testID="payment-date"
                style={styles.dateSelector}
                onPress={() => {
                  setTempDate(paymentDate || todayISO());
                  setCalendarOpen(true);
                }}
                activeOpacity={0.8}
              >
                <View style={styles.dateIconBox}>
                  <MaterialCommunityIcons name="calendar-month-outline" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.dateSelectorValue}>{formatFriendlyDate(paymentDate)}</Text>
                  <Text style={styles.dateSelectorIso}>{paymentDate}</Text>
                </View>
                <View style={styles.dateActionChip}>
                  <MaterialCommunityIcons name="calendar" size={15} color={colors.primary} />
                  <Text style={styles.dateActionChipText}>Select Date</Text>
                </View>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Payment Mode *</Text>
            <View style={styles.modeGrid}>
              {MODES.map(m => (
                <TouchableOpacity
                  key={m}
                  testID={`payment-mode-${m.toLowerCase()}`}
                  style={[styles.modeChip, mode === m && styles.modeChipActive]}
                  onPress={() => setMode(m)}
                >
                  <Text style={[styles.modeText, mode === m && { color: "#fff" }]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Input
              testID="payment-remarks"
              label="Remarks / Reference (Manual Ledger Folio #, UPI Ref, Cheque #)"
              value={remarks}
              onChangeText={setRemarks}
              multiline
            />

            <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
              <Button
                testID="payment-submit"
                title="Record Customer Payment"
                onPress={submit}
                loading={saving}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* Calendar Date Picker Modal */}
      <Modal
        visible={calendarOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCalendarOpen(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerSheetHandle} />

            <View style={styles.pickerHeader}>
              <View>
                <Text style={styles.pickerSheetTitle}>Select Payment Date</Text>
                <Text style={styles.pickerSheetSub}>Choose transaction date for payment record</Text>
              </View>
              <TouchableOpacity
                onPress={() => setCalendarOpen(false)}
                style={styles.pickerCloseBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialCommunityIcons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Quick Presets */}
            <View style={styles.presetsRow}>
              <TouchableOpacity
                style={[
                  styles.presetChip,
                  tempDate === todayISO() && styles.presetChipActive,
                ]}
                onPress={() => setTempDate(todayISO())}
              >
                <MaterialCommunityIcons
                  name="calendar-today"
                  size={14}
                  color={tempDate === todayISO() ? "#fff" : colors.primary}
                />
                <Text
                  style={[
                    styles.presetChipText,
                    tempDate === todayISO() && styles.presetChipTextActive,
                  ]}
                >
                  Today
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.presetChip,
                  tempDate === (() => {
                    const d = new Date();
                    d.setDate(d.getDate() - 1);
                    return d.toISOString().slice(0, 10);
                  })() && styles.presetChipActive,
                ]}
                onPress={() => {
                  const d = new Date();
                  d.setDate(d.getDate() - 1);
                  setTempDate(d.toISOString().slice(0, 10));
                }}
              >
                <MaterialCommunityIcons
                  name="history"
                  size={14}
                  color={
                    tempDate === (() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 1);
                      return d.toISOString().slice(0, 10);
                    })()
                      ? "#fff"
                      : colors.primary
                  }
                />
                <Text
                  style={[
                    styles.presetChipText,
                    tempDate === (() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 1);
                      return d.toISOString().slice(0, 10);
                    })() && styles.presetChipTextActive,
                  ]}
                >
                  Yesterday
                </Text>
              </TouchableOpacity>
            </View>

            {/* Calendar */}
            <Calendar
              startDate={tempDate}
              endDate={tempDate}
              onSelectRange={(s) => {
                if (s) setTempDate(s);
              }}
            />

            {/* Selected Date Preview */}
            <View style={styles.selectedDatePreview}>
              <MaterialCommunityIcons name="check-circle" size={16} color={colors.primary} />
              <Text style={styles.selectedDatePreviewText}>
                Selected: <Text style={{ fontWeight: "800", color: colors.text }}>{formatFriendlyDate(tempDate)}</Text> ({tempDate})
              </Text>
            </View>

            {/* Action Buttons */}
            <View style={styles.pickerSheetActions}>
              <TouchableOpacity
                style={styles.pickerSheetCancel}
                onPress={() => setCalendarOpen(false)}
              >
                <Text style={styles.pickerSheetCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.pickerSheetApply}
                onPress={() => {
                  setPaymentDate(tempDate);
                  setCalendarOpen(false);
                }}
              >
                <MaterialCommunityIcons name="check" size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.pickerSheetApplyText}>Confirm Date</Text>
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
  label: { fontSize: 13, fontWeight: "700", color: colors.textMuted, marginBottom: spacing.xs },
  modeGrid: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  modeChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
  },
  modeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  modeText: { fontSize: 13, fontWeight: "800", color: colors.textMuted },

  statsLoadingBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: spacing.md,
    backgroundColor: "#F8FAFC",
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  statsLoadingText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "600",
  },
  customerSummaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.sm,
  },
  summaryTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    marginBottom: 10,
  },
  summaryCustTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
  },
  ledgerLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: `${colors.primary}12`,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  ledgerLinkText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
  },
  summaryMetricsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryMetricItem: {
    flex: 1,
    alignItems: "center",
  },
  metricDivider: {
    width: 1,
    height: 36,
    backgroundColor: "#E2E8F0",
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
  },
  metricSub: {
    fontSize: 9,
    fontWeight: "600",
    color: colors.textMuted,
    marginTop: 1,
  },
  autofillBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: `${colors.primary}10`,
    paddingVertical: 7,
    borderRadius: radius.sm,
    marginTop: 10,
    borderWidth: 1,
    borderColor: `${colors.primary}25`,
  },
  autofillBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary,
  },
  calcBox: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: -8,
    marginBottom: spacing.md,
    gap: 4,
  },
  calcLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
  },
  calcResultPending: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.danger,
  },
  calcResultCleared: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.success,
  },
  calcResultAdvance: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
  },

  dateSelector: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
  dateIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: `${colors.primary}15`,
    alignItems: "center",
    justifyContent: "center",
  },
  dateSelectorValue: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  dateSelectorIso: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  dateActionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: `${colors.primary}12`,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  dateActionChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },

  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  pickerSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: Platform.OS === "ios" ? 40 : spacing.xl,
    maxHeight: "90%",
    ...shadow.card,
  },
  pickerSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.md,
  },
  pickerSheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  pickerSheetSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  pickerCloseBtn: {
    padding: 4,
  },
  presetsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: 6,
  },
  presetChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#F8FAFC",
  },
  presetChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
  },
  presetChipTextActive: {
    color: "#fff",
  },
  selectedDatePreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: `${colors.primary}10`,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  selectedDatePreviewText: {
    fontSize: 12,
    color: colors.textMuted,
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
    fontSize: 14,
  },
  pickerSheetApply: {
    flex: 1.5,
    flexDirection: "row",
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.card,
  },
  pickerSheetApplyText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },

  successBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: spacing.xl },
  successCard: { width: "100%", maxWidth: 420, backgroundColor: "#fff", borderRadius: radius.xl, padding: spacing.xl, alignItems: "center", ...shadow.card },
  successIconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#2E7D32", alignItems: "center", justifyContent: "center", marginBottom: spacing.md, ...shadow.card },
  successTitle: { fontSize: 20, fontWeight: "800", color: colors.text, marginBottom: 8 },
  amountBadge: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#E8F5E9", paddingHorizontal: 16, paddingVertical: 6, borderRadius: radius.pill, marginBottom: spacing.lg },
  amountBadgeText: { fontSize: 18, fontWeight: "800", color: "#2E7D32" },
  modePill: { backgroundColor: "#C8E6C9", paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  modePillText: { fontSize: 11, fontWeight: "800", color: "#1B5E20", textTransform: "uppercase" },
  summaryBox: { width: "100%", backgroundColor: "#f9fbf9", borderRadius: radius.lg, borderWidth: 1, borderColor: "#e8efe8", padding: spacing.md, gap: 8, marginBottom: spacing.lg },
  summaryItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryLabel: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  summaryValue: { fontSize: 13, fontWeight: "700", color: colors.text, maxWidth: "65%" },
  phoneInputWrap: { width: "100%", marginBottom: spacing.lg },
  phoneLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", marginBottom: 6, letterSpacing: 0.3 },
  phoneInputBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, height: 46, backgroundColor: "#fcfdfc" },
  phoneInput: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.text },
  whatsAppActionBtn: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#25D366", paddingVertical: 14, borderRadius: radius.lg, marginBottom: spacing.sm, ...shadow.card },
  whatsAppActionBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  smsActionBtn: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#E3F2FD", paddingVertical: 12, borderRadius: radius.lg, marginBottom: spacing.md },
  smsActionBtnText: { color: "#1565C0", fontSize: 14, fontWeight: "700" },
  dismissBtn: { paddingVertical: 8, paddingHorizontal: spacing.md },
  dismissBtnText: { fontSize: 14, fontWeight: "700", color: colors.textMuted },
});
