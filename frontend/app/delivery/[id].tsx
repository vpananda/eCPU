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
import { storage } from "@/src/utils/storage";

const MODES = ["Cash", "UPI", "Bank", "Credit"];

function fmtDate(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  const dateStr = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const timeStr = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${dateStr}, ${timeStr}`;
}

export default function DeliveryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [batch, setBatch] = useState<any>(null);
  const [loadingData, setLoadingData] = useState(true);

  const [deliverCombined, setDeliverCombined] = useState(false);
  const [dryWeight, setDryWeight] = useState("");
  const [processedBags, setProcessedBags] = useState("");
  const [rate, setRate] = useState("12");
  const [amountReceived, setAmountReceived] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [receivedBy, setReceivedBy] = useState("");
  const [receivedPhone, setReceivedPhone] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id || id === "[id]") return;
    try {
      const b = await api<any>(`/batches/${id}`);
      setBatch(b);
      if (b.rate_per_kg) setRate(String(b.rate_per_kg));

      const hasSiblings = b.sibling_batches && b.sibling_batches.length > 1;
      const allDone = hasSiblings && b.sibling_batches.every(
        (s: any) => s.status === "Completed" || s.status === "Delivered"
      );

      if (allDone) {
        // All lots finished drying! Combined delivery is available & enabled by default
        setDeliverCombined(true);
        const totalDry = b.sibling_batches.reduce((acc: number, s: any) => acc + Number(s.actual_dry_weight || 0), 0);
        const totalBags = b.sibling_batches.reduce((acc: number, s: any) => acc + Number(s.processed_bags || 0), 0);
        setDryWeight(totalDry > 0 ? String(totalDry) : (b.actual_dry_weight ? String(b.actual_dry_weight) : ""));
        setProcessedBags(totalBags > 0 ? String(totalBags) : (b.processed_bags ? String(b.processed_bags) : ""));
      } else {
        // Some siblings are still drying or received. Keep combined OFF to protect active dryers!
        setDeliverCombined(false);
        if (b.actual_dry_weight) setDryWeight(String(b.actual_dry_weight));
        if (b.processed_bags) setProcessedBags(String(b.processed_bags));
      }
    } catch (e: any) {
      toast.show(e.message || "Failed to load batch", "error");
    } finally { setLoadingData(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const isSplit = Boolean(batch?.sibling_batches && batch.sibling_batches.length > 1);
  const siblingBatches: any[] = batch?.sibling_batches || [];

  const allSiblingsCompleted = isSplit && siblingBatches.every(
    (s: any) => s.status === "Completed" || s.status === "Delivered"
  );
  const incompleteLots = isSplit ? siblingBatches.filter(
    (s: any) => s.status !== "Completed" && s.status !== "Delivered"
  ) : [];

  const handleToggleCombined = () => {
    if (!allSiblingsCompleted) {
      const pendingNames = incompleteLots.map((s: any) => `${s.batch_no} (${s.status})`).join(", ");
      toast.show(
        `Combined delivery locked: ${pendingNames} still in progress. Active dryers will not be stopped. Deliver this lot individually or wait for all dryers.`,
        "error"
      );
      return;
    }
    const next = !deliverCombined;
    setDeliverCombined(next);
    if (next) {
      const totalDry = siblingBatches.reduce((acc: number, s: any) => acc + Number(s.actual_dry_weight || 0), 0);
      const totalBags = siblingBatches.reduce((acc: number, s: any) => acc + Number(s.processed_bags || 0), 0);
      setDryWeight(totalDry > 0 ? String(totalDry) : (batch?.actual_dry_weight ? String(batch.actual_dry_weight) : ""));
      setProcessedBags(totalBags > 0 ? String(totalBags) : (batch?.processed_bags ? String(batch.processed_bags) : ""));
    } else {
      setDryWeight(batch?.actual_dry_weight ? String(batch.actual_dry_weight) : "");
      setProcessedBags(batch?.processed_bags ? String(batch.processed_bags) : "");
    }
  };

  const arrivalWeight = isSplit && deliverCombined
    ? Number(batch?.total_arrival_weight || batch?.raw_weight || 0)
    : Number(batch?.raw_weight || 0);

  const dryNum = parseFloat(dryWeight || "0");
  const rateNum = parseFloat(rate || "0");
  const totalAmount = Math.max(0, arrivalWeight * rateNum);

  const alreadyPaid = isSplit && deliverCombined
    ? siblingBatches.reduce((acc: number, s: any) => acc + Number(s.total_paid || 0), 0)
    : Number(batch?.total_paid || 0);

  const balanceDue = Math.max(0, totalAmount - alreadyPaid);
  const receivedNum = parseFloat(amountReceived || "0");
  const remaining = Math.max(0, balanceDue - receivedNum);

  const isCompleted = batch?.status === "Completed" || batch?.status === "Delivered";

  const submit = async () => {
    if (!isCompleted && !(isSplit && deliverCombined && allSiblingsCompleted)) {
      return toast.show(`Batch cannot be delivered until processing is Completed (currently ${batch.status})`, "error");
    }
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
          deliver_siblings: isSplit && deliverCombined && allSiblingsCompleted,
          delivery_date: deliveryDate ? `${deliveryDate}T${new Date().toISOString().slice(11, 19)}Z` : undefined,
        },
      });
      await storage.removeItem("cached_arrivals_dashboard");
      toast.show(
        isSplit && deliverCombined && allSiblingsCompleted
          ? `All ${siblingBatches.length} split lots delivered combinedly & WhatsApp statement sent!`
          : `Lot ${batch.batch_no} delivered successfully. Active dryers continue running!`
      );
      router.replace(`/batch/${id}`);
    } catch (e: any) {
      toast.show(e.message || "Failed", "error");
    } finally { setSaving(false); }
  };

  if (loadingData) {
    return <SafeAreaView style={styles.safe}><ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} /></SafeAreaView>;
  }

  if (!batch) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Batch data not found.</Text>
          <TouchableOpacity style={styles.errorBtn} onPress={() => router.back()}>
            <Text style={styles.errorBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const weightLoss = dryNum > 0 ? Math.max(0, arrivalWeight - dryNum) : 0;
  const lossPct = arrivalWeight > 0 && dryNum > 0 ? ((weightLoss / arrivalWeight) * 100).toFixed(1) : "0.0";
  const yieldPct = arrivalWeight > 0 && dryNum > 0 ? ((dryNum / arrivalWeight) * 100).toFixed(1) : "0.0";

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

          {!isCompleted && !(isSplit && deliverCombined && allSiblingsCompleted) && (
            <View style={styles.notCompletedBanner}>
              <MaterialCommunityIcons name="alert-circle" size={18} color="#B45309" />
              <Text style={styles.notCompletedText}>
                ⚠️ Processing is not completed yet (Status: {batch.status}). Batches must be marked "Completed" before delivery.
              </Text>
            </View>
          )}

          {/* Active Dryer Protection Banner if any sibling is still drying */}
          {isSplit && !allSiblingsCompleted && (
            <View style={styles.dryerProtectedBanner}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <MaterialCommunityIcons name="shield-check" size={20} color="#047857" />
                <Text style={styles.dryerProtectedTitle}>Active Dryers Protected (No Auto-Close)</Text>
              </View>
              <Text style={styles.dryerProtectedText}>
                Split sibling lot(s) currently drying ({incompleteLots.map((s: any) => `${s.batch_no} in ${s.machine_name || 'Dryer'}`).join(", ")}) will <Text style={{ fontWeight: "800", color: "#065F46" }}>NOT</Text> be stopped or closed.
              </Text>
              <Text style={[styles.dryerProtectedText, { marginTop: 4 }]}>
                Confirming now will deliver <Text style={{ fontWeight: "800", color: "#065F46" }}>ONLY Lot {batch.batch_no}</Text> ({arrivalWeight} kg wet • {dryNum || batch.actual_dry_weight || 0} kg dry • ₹{totalAmount.toFixed(0)}). Active dryers continue running until drying completes.
              </Text>
            </View>
          )}

          {/* Multi-Dryer Split Arrival Section */}
          {isSplit && (
            <View style={styles.combinedBox}>
              <View style={styles.combinedHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                  <MaterialCommunityIcons name="call-split" size={20} color={colors.primary} />
                  <Text style={styles.combinedTitle}>Split Arrival ({siblingBatches.length} Lots)</Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.combinedToggleBtn,
                    deliverCombined && styles.combinedToggleBtnActive,
                    !allSiblingsCompleted && styles.combinedToggleBtnDisabled,
                  ]}
                  onPress={handleToggleCombined}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons
                    name={!allSiblingsCompleted ? "lock" : (deliverCombined ? "checkbox-marked" : "checkbox-blank-outline")}
                    size={15}
                    color={!allSiblingsCompleted ? colors.textMuted : (deliverCombined ? "#fff" : colors.textMuted)}
                  />
                  <Text
                    style={[
                      styles.combinedToggleText,
                      deliverCombined && { color: "#fff" },
                      !allSiblingsCompleted && { color: colors.textMuted },
                    ]}
                  >
                    {!allSiblingsCompleted ? "Combined (Locked)" : "Deliver Combined"}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.combinedNotice}>
                {deliverCombined && allSiblingsCompleted
                  ? `Delivering combined: All ${siblingBatches.length} split lots will be delivered together under ONE consolidated bill & ONE WhatsApp message.`
                  : !allSiblingsCompleted
                    ? `Individual delivery active for Lot ${batch.batch_no}. Combined delivery will unlock once all dryers finish drying.`
                    : "Delivering only this specific split lot individually."}
              </Text>

              <View style={styles.siblingList}>
                {siblingBatches.map((sb: any) => (
                  <View key={sb.id} style={[styles.siblingItem, sb.id === batch.id && styles.siblingItemCurrent]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.siblingBno}>
                        {sb.batch_no} {sb.id === batch.id ? " (This Lot)" : ""}
                      </Text>
                      <Text style={styles.siblingMeta}>
                        {sb.machine_name || "Dryer"} • {sb.raw_weight} kg wet
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        {sb.status === "Drying" && (
                          <MaterialCommunityIcons name="fire" size={13} color="#D97706" />
                        )}
                        <Text
                          style={[
                            styles.siblingStatusText,
                            {
                              color:
                                sb.status === "Completed"
                                  ? "#2E7D32"
                                  : sb.status === "Delivered"
                                  ? "#7B1FA2"
                                  : colors.warning,
                            },
                          ]}
                        >
                          {sb.status}
                        </Text>
                      </View>
                      {sb.actual_dry_weight ? (
                        <Text style={styles.siblingDryText}>{sb.actual_dry_weight} kg dry</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Batch summary card */}
          <View style={styles.summary}>
            <View style={styles.sumHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.batchNo}>
                  {isSplit && deliverCombined && allSiblingsCompleted
                    ? `${batch.batch_no.split("-")[0]} (Combined Arrival)`
                    : isSplit
                    ? `${batch.batch_no} (Partial Delivery)`
                    : batch.batch_no}
                </Text>
                <Text style={styles.customer}>{batch.customer?.name} · {batch.customer?.mobile}</Text>
              </View>
              <View style={styles.productChip}>
                <Text style={styles.productChipText}>{batch.product?.name || "Cardamom"}</Text>
              </View>
            </View>
            <View style={styles.sumRow}>
              <SumStat
                label={isSplit && deliverCombined && allSiblingsCompleted ? "Total Arrival Weight" : "Lot Raw Weight"}
                value={`${arrivalWeight} kg`}
              />
              <SumStat label="Bags at arrival" value={String(batch.bags || 0)} />
              {batch.padi_weight != null && Number(batch.padi_weight) > 0 ? (
                <SumStat label="Padi Wt (1L)" value={`${batch.padi_weight}`} />
              ) : (
                <SumStat
                  label="Machine"
                  value={
                    isSplit && deliverCombined && allSiblingsCompleted
                      ? `${siblingBatches.length} Dryers`
                      : (batch.machine?.name || "-")
                  }
                />
              )}
            </View>

            {/* Prominently Highlighted Arrival Date & Lifecycle Timeline */}
            <View style={styles.lifecycleRow}>
              <View style={styles.arrivalHighlightChip}>
                <MaterialCommunityIcons name="calendar-month-outline" size={14} color="#166534" />
                <Text style={styles.arrivalHighlightValue}>{fmtDate(batch.arrival_date || batch.created_at)}</Text>
              </View>
              {batch.processing_started_at ? (
                <View style={styles.timelineChip}>
                  <MaterialCommunityIcons name="fire" size={13} color="#D97706" />
                  <Text style={styles.timelineChipLabel}>Drying Started:</Text>
                  <Text style={styles.timelineChipValue}>{fmtDateTime(batch.processing_started_at)}</Text>
                </View>
              ) : null}
              {batch.processing_ended_at ? (
                <View style={styles.timelineChip}>
                  <MaterialCommunityIcons name="check-circle" size={13} color="#2E7D32" />
                  <Text style={styles.timelineChipLabel}>Drying Finished:</Text>
                  <Text style={styles.timelineChipValue}>{fmtDateTime(batch.processing_ended_at)}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <Text style={styles.section}>Processed Details</Text>

          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Input
                testID="delivery-dry-weight"
                label={isSplit && deliverCombined && allSiblingsCompleted ? "Combined Dry Weight (kg) *" : "Processed Weight (kg) *"}
                keyboardType="decimal-pad"
                value={dryWeight}
                onChangeText={setDryWeight}
                placeholder="e.g. 112"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                testID="delivery-processed-bags"
                label="No. of Bags"
                keyboardType="number-pad"
                value={processedBags}
                onChangeText={setProcessedBags}
              />
            </View>
          </View>

          {dryNum > 0 && (
            <View style={styles.lossPill}>
              <MaterialCommunityIcons name="scale-balance" size={14} color={colors.warning} />
              <Text style={styles.lossText}>
                Weight loss: {weightLoss.toFixed(2)} kg ({lossPct}%) • Yield: {yieldPct}%
              </Text>
            </View>
          )}

          <Input testID="delivery-rate" label="Rate per kg (₹)" keyboardType="decimal-pad" value={rate} onChangeText={setRate} />

          <View style={styles.billCard}>
            <Row
              label={
                isSplit && deliverCombined && allSiblingsCompleted
                  ? "Total Arrival (Combined) × Rate"
                  : `Lot ${batch.batch_no} Raw Weight × Rate`
              }
              value={`${arrivalWeight || 0} kg × ₹${rateNum || 0}`}
            />
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

          <Text style={styles.section}>Handed Over To & Delivery Date</Text>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1.2 }}>
              <Input testID="delivery-received-by" label="Person Name *" value={receivedBy} onChangeText={setReceivedBy} placeholder="Full name" />
            </View>
            <View style={{ flex: 1 }}>
              <Input testID="delivery-date" label="Delivery Date *" value={deliveryDate} onChangeText={setDeliveryDate} placeholder="YYYY-MM-DD" />
            </View>
          </View>
          <Input testID="delivery-received-phone" label="Phone Number" value={receivedPhone} onChangeText={setReceivedPhone} keyboardType="phone-pad" placeholder="10-digit number" maxLength={15} />
          <Input testID="delivery-remarks" label="Remarks" value={remarks} onChangeText={setRemarks} multiline placeholder="Optional notes" />

          <View style={{ height: spacing.md }} />
          <Button
            testID="delivery-submit"
            title={
              isSplit && deliverCombined && allSiblingsCompleted
                ? `Confirm Combined Delivery (${arrivalWeight} kg • ₹${totalAmount.toFixed(0)})`
                : isSplit
                ? `Deliver Lot ${batch.batch_no} (${arrivalWeight} kg • ₹${totalAmount.toFixed(0)})`
                : "Confirm Delivery"
            }
            onPress={submit}
            loading={saving}
          />
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
  notCompletedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF3C7",
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#FDE68A",
    marginBottom: spacing.md,
  },
  notCompletedText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: "#92400E",
    lineHeight: 16,
  },
  dryerProtectedBanner: {
    backgroundColor: "#ECFDF5",
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: "#A7F3D0",
    marginBottom: spacing.md,
  },
  dryerProtectedTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#065F46",
  },
  dryerProtectedText: {
    fontSize: 12,
    color: "#047857",
    lineHeight: 16,
  },
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
  lifecycleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
  },
  arrivalHighlightChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#86EFAC",
  },
  arrivalHighlightLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#166534",
  },
  arrivalHighlightValue: {
    fontSize: 12,
    fontWeight: "800",
    color: "#14532D",
  },
  timelineChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fff",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timelineChipLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
  },
  timelineChipValue: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text,
  },
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
  errorContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.xl, gap: spacing.md },
  errorText: { fontSize: 16, color: colors.textMuted, textAlign: "center", fontWeight: "600" },
  errorBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.primary, borderRadius: radius.pill },
  errorBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  combinedBox: {
    backgroundColor: "#F0FDF4",
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1.5,
    borderColor: "#BBF7D0",
  },
  combinedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  combinedTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.primary,
  },
  combinedToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  combinedToggleBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  combinedToggleBtnDisabled: {
    backgroundColor: "#F3F4F6",
    borderColor: "#E5E7EB",
  },
  combinedToggleText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
  },
  combinedNotice: {
    fontSize: 11,
    color: "#166534",
    marginBottom: 10,
    lineHeight: 15,
  },
  siblingList: {
    gap: 6,
  },
  siblingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#DCFCE7",
  },
  siblingItemCurrent: {
    borderColor: colors.primary,
    backgroundColor: "#F7FEE7",
  },
  siblingBno: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
  },
  siblingMeta: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  siblingStatusText: {
    fontSize: 11,
    fontWeight: "800",
  },
  siblingDryText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#2E7D32",
    marginTop: 1,
  },
});
