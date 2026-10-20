import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, ActivityIndicator } from "react-native";
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
import { colors, radius, spacing } from "@/src/theme";

const MODES = ["Cash", "UPI", "Bank", "Credit"];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

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
  const [batchId, setBatchId] = useState<string | null>(null);
  const [customerBatches, setCustomerBatches] = useState<any[]>([]);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("Cash");
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [remarks, setRemarks] = useState("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (params.customer_id) setCustomerId(params.customer_id);
    if (params.branch_id) setBranchId(params.branch_id);
    if (params.batch_id) setBatchId(params.batch_id);
    if (params.suggest_amount) setAmount(params.suggest_amount);
  }, [params.customer_id, params.branch_id, params.batch_id, params.suggest_amount]);

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

  // Load pending batches when customer is selected
  useEffect(() => {
    if (customerId) {
      api(`/customers/${customerId}`)
        .then(c => {
          const batches = (c.history || []).map((b: any) => ({
            id: b.id,
            name: `${b.batch_no} (${b.product_name || "Spice"} · Bal: ₹${Number(b.balance_amount || 0).toLocaleString("en-IN")})`,
            balance: b.balance_amount || 0,
          }));
          setCustomerBatches(batches);
        })
        .catch(() => {
          setCustomerBatches([]);
        });
    } else {
      setCustomerBatches([]);
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
          batch_id: batchId || null,
          customer_id: customerId,
          branch_id: branchId,
          amount: a,
          mode,
          remarks,
          created_at: paymentDate ? `${paymentDate}T12:00:00Z` : undefined,
        },
      });
      toast.show(batchId ? "Payment applied to batch" : "Advance / payment recorded");
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

            {/* Optional Batch Selector */}
            {customerBatches.length > 0 ? (
              <Picker
                testID="payment-batch"
                label="Apply to Specific Batch (Optional)"
                placeholder="Advance / General Account Credit"
                value={batchId}
                onChange={setBatchId}
                options={[
                  { id: "", name: "— General Credit / Advance Payment —" },
                  ...customerBatches,
                ]}
              />
            ) : null}

            <Input
              testID="payment-amount"
              label="Amount (₹) *"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
            />

            {/* Payment Date */}
            <Input
              testID="payment-date"
              label="Payment Date (YYYY-MM-DD)"
              value={paymentDate}
              onChangeText={setPaymentDate}
              placeholder="YYYY-MM-DD"
            />

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
                title={batchId ? "Record Batch Payment" : "Record Customer Payment"}
                onPress={submit}
                loading={saving}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
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
});
