import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import { Input } from "@/src/components/Input";
import { Button } from "@/src/components/Button";
import { colors, radius, shadow, spacing } from "@/src/theme";

const MODES = ["Cash", "UPI", "Bank", "Credit"];

export default function DeliveryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [batch, setBatch] = useState<any>(null);
  const [loadingData, setLoadingData] = useState(true);

  const [dryWeight, setDryWeight] = useState("");
  const [processedBags, setProcessedBags] = useState("");
  const [rate, setRate] = useState("12");
  const [amountReceived, setAmountReceived] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [receivedBy, setReceivedBy] = useState("");
  const [receivedPhone, setReceivedPhone] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const b = await api<any>(`/batches/${id}`);
      setBatch(b);
      if (b.rate_per_kg) setRate(String(b.rate_per_kg));
    } finally { setLoadingData(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const dryNum = parseFloat(dryWeight || "0");
  const rateNum = parseFloat(rate || "0");
  const totalAmount = Math.max(0, dryNum * rateNum);
  const alreadyPaid = batch?.total_paid || 0;
  const balanceDue = Math.max(0, totalAmount - alreadyPaid);
  const receivedNum = parseFloat(amountReceived || "0");
  const remaining = Math.max(0, balanceDue - receivedNum);

  const submit = async () => {
    if (!dryNum || dryNum <= 0) return toast.show("Enter processed dry weight", "error");
    if (!receivedBy.trim()) return toast.show("Enter person receiving", "error");
    setSaving(true);
    try {
      await api(`/batches/${id}/delivery`, {
        method: "POST",
        body: {
          actual_dry_weight: dryNum,
          processed_bags: parseInt(processedBags || "0", 10),
          rate_per_kg: rateNum,
          received_by: receivedBy.trim(),
          received_by_phone: receivedPhone.trim(),
          amount_received: receivedNum,
          payment_mode: paymentMode,
          remarks,
        },
      });
      toast.show("Batch delivered");
      router.replace(`/batch/${id}`);
    } catch (e: any) {
      toast.show(e.message || "Failed", "error");
    } finally { setSaving(false); }
  };

  if (loadingData || !batch) {
    return <SafeAreaView style={styles.safe}><ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} /></SafeAreaView>;
  }

  const weightLoss = dryNum > 0 ? Math.max(0, batch.raw_weight - dryNum) : 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="delivery-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Delivery</Text>
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

          {/* Batch summary card */}
          <View style={styles.summary}>
            <View style={styles.sumHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.batchNo}>{batch.batch_no}</Text>
                <Text style={styles.customer}>{batch.customer?.name} · {batch.customer?.mobile}</Text>
              </View>
              <View style={styles.productChip}>
                <Text style={styles.productChipText}>{batch.product?.name}</Text>
              </View>
            </View>
            <View style={styles.sumRow}>
              <SumStat label="Arrival Weight" value={`${batch.raw_weight} kg`} />
              <SumStat label="Bags at arrival" value={String(batch.bags || 0)} />
              <SumStat label="Machine" value={batch.machine?.name || "-"} />
            </View>
          </View>

          <Text style={styles.section}>Processed Details</Text>

          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Input testID="delivery-dry-weight" label="Processed Weight (kg) *" keyboardType="decimal-pad" value={dryWeight} onChangeText={setDryWeight} placeholder="e.g. 160" />
            </View>
            <View style={{ flex: 1 }}>
              <Input testID="delivery-processed-bags" label="No. of Bags" keyboardType="number-pad" value={processedBags} onChangeText={setProcessedBags} />
            </View>
          </View>

          {dryNum > 0 && (
            <View style={styles.lossPill}>
              <MaterialCommunityIcons name="scale-balance" size={14} color={colors.warning} />
              <Text style={styles.lossText}>Weight loss: {weightLoss.toFixed(2)} kg ({((weightLoss / batch.raw_weight) * 100).toFixed(1)}%)</Text>
            </View>
          )}

          <Input testID="delivery-rate" label="Rate per kg (₹)" keyboardType="decimal-pad" value={rate} onChangeText={setRate} />

          <View style={styles.billCard}>
            <Row label="Processed × Rate" value={`${dryNum || 0} × ₹${rateNum || 0}`} />
            <Row label="Total Amount" value={`₹${totalAmount.toFixed(2)}`} bold />
            <Row label="Already Paid (advance)" value={`₹${alreadyPaid.toFixed(2)}`} />
            <View style={styles.hr} />
            <Row label="Balance Due" value={`₹${balanceDue.toFixed(2)}`} bold accent />
          </View>

          <Text style={styles.section}>Payment at Delivery</Text>
          <Input testID="delivery-amount-received" label="Amount Received (₹)" keyboardType="decimal-pad" value={amountReceived} onChangeText={setAmountReceived} placeholder="0.00" />
          <Text style={styles.label}>Mode</Text>
          <View style={styles.modeGrid}>
            {MODES.map(m => (
              <TouchableOpacity
                key={m}
                testID={`delivery-mode-${m.toLowerCase()}`}
                style={[styles.modeChip, paymentMode === m && styles.modeChipActive]}
                onPress={() => setPaymentMode(m)}
              >
                <Text style={[styles.modeText, paymentMode === m && { color: "#fff" }]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {receivedNum > 0 && (
            <View style={styles.remainingPill}>
              <MaterialCommunityIcons name="information-outline" size={14} color={colors.info} />
              <Text style={styles.remainingText}>Remaining balance after payment: ₹{remaining.toFixed(2)}</Text>
            </View>
          )}

          <Text style={styles.section}>Handed Over To</Text>
          <Input testID="delivery-received-by" label="Person Name *" value={receivedBy} onChangeText={setReceivedBy} placeholder="Full name" />
          <Input testID="delivery-received-phone" label="Phone Number" value={receivedPhone} onChangeText={setReceivedPhone} keyboardType="phone-pad" placeholder="10-digit number" maxLength={15} />
          <Input testID="delivery-remarks" label="Remarks" value={remarks} onChangeText={setRemarks} multiline placeholder="Optional notes" />

          <View style={{ height: spacing.md }} />
          <Button testID="delivery-submit" title="Confirm Delivery" onPress={submit} loading={saving} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SumStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.sumStat}>
      <Text style={styles.sumLabel}>{label}</Text>
      <Text style={styles.sumValue}>{value}</Text>
    </View>
  );
}

function Row({ label, value, bold, accent }: { label: string; value: string; bold?: boolean; accent?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, bold && { fontWeight: "800", fontSize: 15 }, accent && { color: colors.accent }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  summary: { backgroundColor: colors.primary50, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.lg },
  sumHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  batchNo: { fontSize: 18, fontWeight: "800", color: colors.text },
  customer: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  productChip: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.primary, borderRadius: radius.pill },
  productChipText: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  sumRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  sumStat: { flex: 1 },
  sumLabel: { fontSize: 10, color: colors.textMuted, fontWeight: "700", letterSpacing: 0.3, textTransform: "uppercase" },
  sumValue: { fontSize: 14, color: colors.text, fontWeight: "800", marginTop: 3 },
  section: { fontSize: 13, fontWeight: "800", color: colors.textMuted, letterSpacing: 0.4, textTransform: "uppercase", marginTop: spacing.md, marginBottom: spacing.sm },
  lossPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.warning + "18", padding: 8, borderRadius: radius.pill, alignSelf: "flex-start", marginTop: -4, marginBottom: spacing.md },
  lossText: { fontSize: 12, fontWeight: "700", color: colors.warning },
  billCard: { backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 5 },
  rowLabel: { fontSize: 13, color: colors.textMuted },
  rowValue: { fontSize: 14, color: colors.text, fontWeight: "600" },
  hr: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  label: { fontSize: 12, fontWeight: "700", color: colors.textMuted, marginBottom: 6, letterSpacing: 0.3, textTransform: "uppercase" },
  modeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md },
  modeChip: { paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border },
  modeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  modeText: { fontSize: 13, color: colors.text, fontWeight: "700" },
  remainingPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.info + "15", padding: 8, borderRadius: radius.pill, alignSelf: "flex-start", marginBottom: spacing.md },
  remainingText: { fontSize: 12, fontWeight: "700", color: colors.info },
});
