import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import { Input } from "@/src/components/Input";
import { Button } from "@/src/components/Button";
import { Picker } from "@/src/components/Picker";
import { colors, radius, spacing } from "@/src/theme";

const MODES = ["Cash", "UPI", "Bank", "Credit"];

export default function PaymentForm() {
  const router = useRouter();
  const params = useLocalSearchParams<{ customer_id?: string; branch_id?: string; suggest_amount?: string }>();
  const toast = useToast();
  const { user, branches } = useAuth();

  const isAdmin = user?.role === "Admin";

  const [customers, setCustomers] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("Cash");
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    if (params.customer_id) setCustomerId(params.customer_id);
    if (params.branch_id) setBranchId(params.branch_id);
    if (params.suggest_amount) setAmount(params.suggest_amount);
  }, [params.customer_id, params.branch_id, params.suggest_amount]);
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    setLoading(true);
    api<any[]>("/customers")
      .then(list => {
        setCustomers(list);
      })
      .catch(e => toast.show(e.message || "Failed to load customers", "error"))
      .finally(() => setLoading(false));
  }, []);

  const submit = async () => {
    const a = parseFloat(amount);
    if (!branchId) { toast.show("Select branch", "error"); return; }
    if (!customerId) { toast.show("Select customer", "error"); return; }
    if (!a || a <= 0) { toast.show("Enter valid amount", "error"); return; }
    setSaving(true);
    try {
      await api("/payments", {
        method: "POST",
        body: {
          batch_id: null,
          customer_id: customerId,
          branch_id: branchId,
          amount: a,
          mode,
          remarks
        }
      });
      toast.show("Advance payment collected");
      router.back();
    } catch (e: any) {
      toast.show(e.message, "error");
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
              options={customers.map(c => ({ id: c.id, name: `${c.name} (${c.mobile})` }))}
            />

            <Input testID="payment-amount" label="Amount (₹) *" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="0.00" />

            <Text style={styles.label}>Payment Mode</Text>
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

            <Input testID="payment-remarks" label="Remarks" value={remarks} onChangeText={setRemarks} multiline />

            <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
              <Button testID="payment-submit" title={customerId ? "Collect Payment" : "Collect Advance"} onPress={submit} loading={saving} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  label: { fontSize: 12, fontWeight: "700", color: colors.textMuted, marginBottom: 6, letterSpacing: 0.3, textTransform: "uppercase" },
  modeGrid: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  modeChip: { flex: 1, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  modeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  modeText: { fontSize: 13, fontWeight: "700", color: colors.text },
});
