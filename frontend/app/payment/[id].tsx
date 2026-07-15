import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import { Input } from "@/src/components/Input";
import { Button } from "@/src/components/Button";
import { colors, radius, spacing } from "@/src/theme";

const MODES = ["Cash", "UPI", "Bank", "Credit"];

export default function PaymentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [batch, setBatch] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("Cash");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id || id === "[id]") return;
    try {
      const b = await api<any>(`/batches/${id}`);
      setBatch(b);
    } catch (e: any) {
      toast.show(e.message || "Failed to load batch", "error");
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submit = async () => {
    const a = parseFloat(amount);
    if (!a || a <= 0) { toast.show("Enter valid amount", "error"); return; }
    setSaving(true);
    try {
      await api("/payments", { method: "POST", body: { batch_id: id, amount: a, mode, remarks } });
      toast.show(`₹${a.toFixed(2)} recorded`);
      router.back();
    } catch (e: any) { toast.show(e.message, "error"); }
    finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="payment-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Collect Payment</Text>
        <View style={{ width: 22 }} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl }} keyboardShouldPersistTaps="handled">
          {batch && (
            <View style={styles.balance}>
              <Text style={styles.balanceLabel}>{batch.batch_no} · {batch.customer?.name}</Text>
              <Text style={styles.balanceValue}>₹{(batch.balance_amount || 0).toFixed(2)}</Text>
              <Text style={styles.balanceSub}>Balance Due · Paid ₹{(batch.total_paid || 0).toFixed(2)} of ₹{(batch.bill_amount || 0).toFixed(2)}</Text>
            </View>
          )}

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

          <Input testID="payment-remarks" label="Remarks" value={remarks} onChangeText={setRemarks} placeholder="Optional" />
          <Button testID="payment-submit" title="Record Payment" onPress={submit} loading={saving} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  balance: { backgroundColor: colors.accent, padding: spacing.xl, borderRadius: radius.xl, alignItems: "center", marginBottom: spacing.xl },
  balanceLabel: { color: "#FFE0B2", fontSize: 12, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  balanceValue: { color: "#fff", fontSize: 32, fontWeight: "800", marginTop: 6 },
  balanceSub: { color: "#FFE0B2", fontSize: 12, marginTop: 4 },
  label: { fontSize: 12, fontWeight: "700", color: colors.textMuted, marginBottom: 6, letterSpacing: 0.3, textTransform: "uppercase" },
  modeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md },
  modeChip: { paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border },
  modeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  modeText: { fontSize: 13, color: colors.text, fontWeight: "700" },
});
