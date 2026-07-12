import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { api } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import { Button } from "@/src/components/Button";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { StatusPill } from "@/src/components/ui";

const FLOW = ["Received", "Loaded", "Drying", "Completed", "Delivered"];

export default function BatchDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<any>(`/batches/${id}`);
      setData(d);
    } finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const advance = async () => {
    if (!data) return;
    const idx = FLOW.indexOf(data.status);
    if (idx < 0 || idx >= FLOW.length - 1) return;
    const next = FLOW[idx + 1];
    if (next === "Delivered") { router.push(`/delivery/${id}`); return; }
    setUpdating(true);
    try {
      await api(`/batches/${id}/status`, { method: "PUT", body: { status: next } });
      toast.show(`Batch marked ${next}`);
      await load();
    } catch (e: any) { toast.show(e.message, "error"); }
    finally { setUpdating(false); }
  };

  if (loading || !data) {
    return <SafeAreaView style={styles.safe}><ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} /></SafeAreaView>;
  }

  const currentIdx = FLOW.indexOf(data.status);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="batch-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Batch {data.batch_no}</Text>
        <StatusPill status={data.status} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* QR + Batch header */}
        <View style={styles.hero}>
          <View style={styles.qrBox}>
            <QRCode value={data.qr_code || data.id} size={120} color={colors.text} backgroundColor="#fff" />
          </View>
          <Text style={styles.batchNo}>{data.batch_no}</Text>
          <Text style={styles.receipt}>Receipt: {data.receipt_no}</Text>
        </View>

        {/* Timeline */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Progress</Text>
          {FLOW.map((s, i) => (
            <View key={s} style={styles.timelineRow}>
              <View style={styles.timelineCol}>
                <View style={[styles.tlDot, i <= currentIdx && { backgroundColor: colors.primary }]}>
                  {i <= currentIdx ? <MaterialCommunityIcons name="check" size={12} color="#fff" /> : null}
                </View>
                {i < FLOW.length - 1 ? <View style={[styles.tlLine, i < currentIdx && { backgroundColor: colors.primary }]} /> : null}
              </View>
              <View style={{ flex: 1, paddingBottom: i < FLOW.length - 1 ? spacing.md : 0 }}>
                <Text style={[styles.tlText, i === currentIdx && { color: colors.primary, fontWeight: "800" }]}>{s}</Text>
                {data.status_history?.filter((h: any) => h.status === s)[0] ? (
                  <Text style={styles.tlTime}>
                    {new Date(data.status_history.filter((h: any) => h.status === s)[0].at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>

        {/* Details */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Details</Text>
          <Row label="Customer" value={data.customer?.name || "-"} sub={data.customer?.mobile} />
          {data.received_from && data.received_from !== data.customer?.name ? (
            <Row label="Received From" value={data.received_from} />
          ) : null}
          <Row label="Product" value={data.product?.name || "-"} />
          <Row label="Machine" value={data.machine?.name || "-"} />
          <Row label="Raw Weight" value={`${data.raw_weight} kg`} />
          <Row label="Est. Dry Weight" value={`${data.estimated_dry_weight} kg`} />
          {data.actual_dry_weight ? <Row label="Actual Dry Weight" value={`${data.actual_dry_weight} kg`} /> : null}
          {data.weight_loss !== null && data.weight_loss !== undefined ? <Row label="Weight Loss" value={`${data.weight_loss} kg`} /> : null}
          <Row label="Moisture" value={`${data.moisture}%`} />
          <Row label="Bags" value={`${data.bags} × ${data.bag_weight}kg`} />
        </View>

        {/* Bill */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Billing</Text>
          <Row label="Rate per kg" value={`₹${data.rate_per_kg}`} />
          <Row label="Loading" value={`₹${data.loading_charges || 0}`} />
          <Row label="Discount" value={`₹${data.discount || 0}`} />
          <View style={styles.hr} />
          <Row label="Bill Amount" value={`₹${(data.bill_amount || 0).toFixed(2)}`} bold />
          <Row label="Paid" value={`₹${(data.total_paid || 0).toFixed(2)}`} />
          <Row label="Balance" value={`₹${(data.balance_amount || 0).toFixed(2)}`} accent bold />

          <TouchableOpacity testID="batch-collect-payment" style={styles.payBtn} onPress={() => router.push(`/payment/${id}`)}>
            <MaterialCommunityIcons name="cash-plus" size={18} color="#fff" />
            <Text style={styles.payBtnText}>Collect Payment</Text>
          </TouchableOpacity>
        </View>

        {/* Payments */}
        {(data.payments || []).length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Payment History</Text>
            {data.payments.map((p: any) => (
              <View key={p.id} style={styles.payRow}>
                <View style={[styles.payIcon, { backgroundColor: colors.primary50 }]}>
                  <MaterialCommunityIcons name="cash" size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.payAmount}>₹{p.amount.toFixed(2)}</Text>
                  <Text style={styles.payMeta}>{p.mode} · {new Date(p.created_at).toLocaleDateString("en-IN")} {p.remarks ? `· ${p.remarks}` : ""}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {data.remarks ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Remarks</Text>
            <Text style={styles.remarks}>{data.remarks}</Text>
          </View>
        ) : null}
      </ScrollView>

      {data.status !== "Delivered" ? (
        <View style={styles.footer}>
          <Button
            testID="batch-advance-status"
            title={data.status === "Completed" ? "Mark Delivered" : `Mark ${FLOW[currentIdx + 1]}`}
            onPress={advance}
            loading={updating}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function Row({ label, value, sub, bold, accent }: { label: string; value: string; sub?: string; bold?: boolean; accent?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={[styles.rowValue, bold && { fontWeight: "800", fontSize: 15 }, accent && { color: colors.accent }]}>{value}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md, gap: spacing.md },
  title: { flex: 1, fontSize: 18, fontWeight: "800", color: colors.text, textAlign: "center" },
  hero: { alignItems: "center", padding: spacing.xl, gap: 4 },
  qrBox: { padding: spacing.md, backgroundColor: "#fff", borderRadius: radius.xl, ...shadow.card },
  batchNo: { fontSize: 20, fontWeight: "800", color: colors.text, marginTop: spacing.md, letterSpacing: -0.3 },
  receipt: { fontSize: 12, color: colors.textMuted },
  card: { marginHorizontal: spacing.xl, backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md, ...shadow.card },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.text, marginBottom: spacing.md },
  timelineRow: { flexDirection: "row", gap: spacing.md },
  timelineCol: { alignItems: "center", width: 20 },
  tlDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.border, alignItems: "center", justifyContent: "center" },
  tlLine: { width: 2, flex: 1, backgroundColor: colors.border, marginVertical: 2 },
  tlText: { fontSize: 14, color: colors.text, fontWeight: "600" },
  tlTime: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  rowLabel: { fontSize: 13, color: colors.textMuted, fontWeight: "500" },
  rowValue: { fontSize: 14, color: colors.text, fontWeight: "600" },
  rowSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  hr: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  payBtn: { marginTop: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 10 },
  payBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  payRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  payIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  payAmount: { fontSize: 15, fontWeight: "800", color: colors.text },
  payMeta: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  remarks: { fontSize: 14, color: colors.text, lineHeight: 20 },
  footer: { padding: spacing.lg, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
});
