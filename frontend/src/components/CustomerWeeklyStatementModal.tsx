import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { openWhatsApp } from "@/src/utils/notifications";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface BatchItem {
  sl_no: number;
  batch_id: string;
  batch_no: string;
  date_str: string;
  arrival_date?: string;
  raw_weight: number;
  actual_dry_weight?: number | null;
  ratio?: number | null;
  padi_weight?: number | null;
  rate_per_kg: number;
  bill_amount: number;
  status: string;
}

interface StatementSummary {
  total_lots: number;
  total_wet_arrival: number;
  total_processed_dry: number;
  processed_wet?: number;
  overall_ratio?: number;
  avg_padi_weight: number;
  drying_count: number;
  ready_count: number;
  delivered_count: number;
  total_billed: number;
  total_paid: number;
  balance_due: number;
}

interface CustomerWeeklyStatementModalProps {
  visible: boolean;
  onClose: () => void;
  customerId: string | null;
  customerName?: string;
  customerMobile?: string;
  branchId?: string | null;
  branchName?: string;
}

export default function CustomerWeeklyStatementModal({
  visible,
  onClose,
  customerId,
  customerName,
  customerMobile,
  branchId,
  branchName,
}: CustomerWeeklyStatementModalProps) {
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendingServer, setSendingServer] = useState(false);
  const [filterMode, setFilterMode] = useState<"pending" | "all">("pending");
  const [data, setData] = useState<{
    customer: any;
    batches: BatchItem[];
    summary: StatementSummary;
    whatsapp_message: string;
  } | null>(null);

  const loadStatement = useCallback(async () => {
    if (!customerId) return;
    try {
      setLoading(true);
      setError(null);
      const qs = new URLSearchParams();
      if (branchId) qs.set("branch_id", branchId);
      qs.set("only_pending", filterMode === "pending" ? "true" : "false");
      qs.set("days", "30");

      const res = await api<any>(`/customers/${customerId}/weekly-statement?${qs.toString()}`);
      setData(res);
    } catch (e: any) {
      setError(e?.message || "Failed to load customer statement");
      toast.show(e?.message || "Failed to load statement", "error");
    } finally {
      setLoading(false);
    }
  }, [customerId, branchId, filterMode, toast]);

  useEffect(() => {
    if (visible && customerId) {
      loadStatement();
    } else {
      setData(null);
    }
  }, [visible, customerId, loadStatement]);

  const handleSendWhatsApp = async () => {
    if (!data?.whatsapp_message) return;
    const phone = data.customer?.mobile || customerMobile;
    if (!phone) {
      return toast.show("Customer has no phone number", "error");
    }
    const ok = await openWhatsApp(phone, data.whatsapp_message);
    if (ok) {
      toast.show("WhatsApp opened with weekly statement!");
    } else {
      toast.show("Could not open WhatsApp", "error");
    }
  };

  const handleSendServer = async () => {
    if (!customerId) return;
    try {
      setSendingServer(true);
      const res = await api<any>(`/customers/${customerId}/send-weekly-statement`, {
        method: "POST",
      });
      if (res?.sent_via === "whatsapp_cloud_api") {
        toast.show("Weekly statement sent directly via WhatsApp Cloud API!");
      } else {
        toast.show("Statement prepared. Tap 'Send via WhatsApp' to deliver.", "info");
      }
    } catch (e: any) {
      toast.show(e?.message || "Could not dispatch statement from server", "error");
    } finally {
      setSendingServer(false);
    }
  };

  const handleCopyText = async () => {
    if (!data?.whatsapp_message) return;
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(data.whatsapp_message);
      toast.show("Statement copied to clipboard!");
    } else {
      toast.show("Table message ready to share!");
    }
  };

  if (!visible) return null;

  const batches = data?.batches || [];
  const summary = data?.summary;
  const custName = data?.customer?.name || customerName || "Customer";
  const custPhone = data?.customer?.mobile || customerMobile || "";
  const bName = data?.customer?.branch_name || branchName || "Factory";

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <MaterialCommunityIcons name="table-large" size={20} color={colors.primary} />
                <Text style={styles.headerTitle} numberOfLines={1}>
                  Weekly Customer Statement
                </Text>
              </View>
              <Text style={styles.headerSub}>
                {custName} · {custPhone || "No Mobile"} · {bName}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {data && (
                <TouchableOpacity
                  onPress={handleSendWhatsApp}
                  style={styles.headerWaBtn}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="whatsapp" size={16} color="#fff" />
                  <Text style={styles.headerWaBtnText}>Send</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialCommunityIcons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Scope Filter Tabs */}
          <View style={styles.filterBar}>
            <TouchableOpacity
              style={[styles.filterChip, filterMode === "pending" && styles.filterChipActive]}
              onPress={() => setFilterMode("pending")}
            >
              <Text style={[styles.filterChipText, filterMode === "pending" && styles.filterChipTextActive]}>
                Only Pending Lots (Drying & Ready)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterChip, filterMode === "all" && styles.filterChipActive]}
              onPress={() => setFilterMode("all")}
            >
              <Text style={[styles.filterChipText, filterMode === "all" && styles.filterChipTextActive]}>
                All Recent Batches (30 Days)
              </Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Generating customer ledger statement...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorWrap}>
              <MaterialCommunityIcons name="alert-circle-outline" size={42} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={loadStatement}>
                <MaterialCommunityIcons name="refresh" size={16} color="#fff" />
                <Text style={styles.retryBtnText}>Retry Loading</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView style={styles.bodyScroll} contentContainerStyle={{ paddingBottom: 24 }}>
              {/* Tabular Column Table */}
              <View style={styles.tableCard}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.th, { width: 28 }]}>Sl</Text>
                  <Text style={[styles.th, { width: 62 }]}>Date</Text>
                  <Text style={[styles.th, { width: 54, textAlign: "right" }]}>Arrival</Text>
                  <Text style={[styles.th, { width: 54, textAlign: "right" }]}>Process</Text>
                  <Text style={[styles.th, { width: 44, textAlign: "right" }]}>Ratio</Text>
                  <Text style={[styles.th, { width: 40, textAlign: "right" }]}>Padi</Text>
                  <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>Amount</Text>
                </View>

                {batches.length === 0 ? (
                  <View style={styles.emptyTable}>
                    <Text style={styles.emptyTableText}>No batches found for this filter criteria.</Text>
                  </View>
                ) : (
                  batches.map((b, idx) => {
                    const isEven = idx % 2 === 0;
                    const isDrying = b.status === "In Queue" || b.status === "Drying" || b.status === "Received" || b.status === "Loaded";
                    const isDelivered = b.status === "Delivered";
                    const calcRatio =
                      b.ratio != null
                        ? Number(b.ratio).toFixed(2)
                        : b.actual_dry_weight && b.actual_dry_weight > 0 && b.raw_weight > 0
                        ? (b.raw_weight / b.actual_dry_weight).toFixed(2)
                        : null;

                    return (
                      <View key={b.batch_id || idx} style={[styles.tr, isEven && styles.trEven]}>
                        <Text style={[styles.td, { width: 28, fontWeight: "700" }]}>
                          {String(idx + 1).padStart(2, "0")}
                        </Text>
                        <Text style={[styles.td, { width: 62, fontSize: 11 }]}>
                          {b.date_str || " - "}
                        </Text>
                        <Text style={[styles.td, { width: 54, textAlign: "right", fontWeight: "700" }]}>
                          {b.raw_weight} <Text style={styles.unit}>kg</Text>
                        </Text>
                        <Text
                          style={[
                            styles.td,
                            {
                              width: 54,
                              textAlign: "right",
                              color: isDrying ? "#D97706" : colors.primary,
                              fontWeight: "700",
                            },
                          ]}
                        >
                          {isDrying ? "Drying" : b.actual_dry_weight ? `${b.actual_dry_weight} kg` : "-"}
                        </Text>
                        <Text
                          style={[
                            styles.td,
                            {
                              width: 44,
                              textAlign: "right",
                              color: calcRatio ? colors.primaryDark : colors.textMuted,
                              fontWeight: "700",
                            },
                          ]}
                        >
                          {calcRatio ? calcRatio : "-"}
                        </Text>
                        <Text style={[styles.td, { width: 40, textAlign: "right", color: colors.textMuted }]}>
                          {b.padi_weight ? Math.round(b.padi_weight) : "-"}
                        </Text>
                        <Text style={[styles.td, { flex: 1, textAlign: "right", fontWeight: "700" }]}>
                          {b.bill_amount > 0 ? `₹${Math.round(b.bill_amount).toLocaleString("en-IN")}` : "-"}
                        </Text>
                      </View>
                    );
                  })
                )}
              </View>

              {/* Summary Stats Grid */}
              {summary && (
                <View style={styles.summaryCard}>
                  <View style={styles.summaryRow}>
                    <View style={styles.summaryCol}>
                      <Text style={styles.summaryLabel}>Total Wet Arrival</Text>
                      <Text style={styles.summaryVal}>
                        {summary.total_wet_arrival.toLocaleString("en-IN", { maximumFractionDigits: 1 })} kg
                      </Text>
                      <Text style={styles.summarySub}>{summary.total_lots} Lots Received</Text>
                    </View>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryCol}>
                      <Text style={styles.summaryLabel}>Processed Dry</Text>
                      <Text style={[styles.summaryVal, { color: colors.primary }]}>
                        {summary.total_processed_dry.toLocaleString("en-IN", { maximumFractionDigits: 1 })} kg
                      </Text>
                      <Text style={styles.summarySub}>
                        {summary.ready_count} Ready · {summary.drying_count} Drying
                      </Text>
                    </View>
                  </View>

                  {/* Ratio & Quality Metric Row */}
                  <View style={[styles.summaryRow, { marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: "#BBF7D0" }]}>
                    <View style={styles.summaryCol}>
                      <Text style={styles.summaryLabel}>Overall Ratio (Wet:Dry)</Text>
                      <Text style={[styles.summaryVal, { color: colors.primaryDark }]}>
                        {(summary.overall_ratio != null && summary.overall_ratio > 0)
                          ? `${Number(summary.overall_ratio).toFixed(2)} : 1`
                          : summary.total_processed_dry > 0
                          ? `${((summary.processed_wet || summary.total_wet_arrival) / summary.total_processed_dry).toFixed(2)} : 1`
                          : "-"}
                      </Text>
                      <Text style={styles.summarySub}>
                        {summary.processed_wet
                          ? `${summary.processed_wet.toLocaleString("en-IN", { maximumFractionDigits: 1 })} kg processed`
                          : `${summary.ready_count} lots dried`}
                      </Text>
                    </View>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryCol}>
                      <Text style={styles.summaryLabel}>Avg Padi Weight</Text>
                      <Text style={styles.summaryVal}>
                        {summary.avg_padi_weight ? `${Math.round(summary.avg_padi_weight)} g/L` : "-"}
                      </Text>
                      <Text style={styles.summarySub}>Bulk Density</Text>
                    </View>
                  </View>

                  <View style={[styles.summaryRow, { marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: "#BBF7D0" }]}>
                    <View style={styles.summaryCol}>
                      <Text style={styles.summaryLabel}>Total Charges</Text>
                      <Text style={styles.summaryVal}>₹{summary.total_billed.toLocaleString("en-IN")}</Text>
                      <Text style={styles.summarySub}>Paid: ₹{summary.total_paid.toLocaleString("en-IN")}</Text>
                    </View>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryCol}>
                      <Text style={styles.summaryLabel}>Pending Balance</Text>
                      <Text
                        style={[
                          styles.summaryVal,
                          { color: summary.balance_due > 0 ? colors.danger : colors.primary },
                        ]}
                      >
                        ₹{summary.balance_due.toLocaleString("en-IN")}
                      </Text>
                      <Text style={styles.summarySub}>
                        {summary.balance_due > 0 ? "Payment Outstanding" : "Fully Settled ✓"}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* WhatsApp Monospace Message Preview */}
              <View style={styles.previewBox}>
                <View style={styles.previewHeader}>
                  <MaterialCommunityIcons name="whatsapp" size={16} color="#25D366" />
                  <Text style={styles.previewTitle}>WhatsApp Formatted Table Preview</Text>
                </View>
                <Text style={styles.previewText} selectable>
                  {data?.whatsapp_message || "No preview available"}
                </Text>
              </View>
            </ScrollView>
          )}

          {/* Action Footer */}
          <View
            style={[
              styles.footer,
              {
                paddingBottom: Math.max(
                  Platform.OS === "android" ? 36 : 16,
                  (insets.bottom || 0) + 16
                ),
              },
            ]}
          >
            <TouchableOpacity
              style={styles.whatsAppBtn}
              onPress={handleSendWhatsApp}
              disabled={loading || !data}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="whatsapp" size={18} color="#fff" />
              <Text style={styles.whatsAppBtnText}>Send on WhatsApp</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.copyBtn}
              onPress={handleCopyText}
              disabled={loading || !data}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="content-copy" size={16} color={colors.primary} />
              <Text style={styles.copyBtnText}>Copy</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.cancelBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: "92%",
    minHeight: "75%",
    paddingTop: spacing.md,
    ...shadow.card,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  headerSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  headerWaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#25D366",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
  },
  headerWaBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#fff",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },

  filterBar: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    backgroundColor: "#F9FAFB",
  },
  filterChip: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
  },
  filterChipActive: { backgroundColor: colors.primary },
  filterChipText: { fontSize: 11, fontWeight: "700", color: colors.textMuted },
  filterChipTextActive: { color: "#fff" },

  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 },
  loadingText: { fontSize: 13, color: colors.textMuted, marginTop: 10, fontWeight: "600" },

  errorWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 50, paddingHorizontal: 20 },
  errorText: { fontSize: 13, color: colors.danger, marginTop: 10, textAlign: "center", fontWeight: "600" },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.md,
    marginTop: 14,
  },
  retryBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  bodyScroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },

  tableCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    backgroundColor: "#fff",
    marginBottom: spacing.md,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#065F46",
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
  },
  th: { fontSize: 11, fontWeight: "800", color: "#ECFDF5", textTransform: "uppercase" },
  tr: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  trEven: { backgroundColor: "#F9FAFB" },
  td: { fontSize: 12, color: colors.text },
  unit: { fontSize: 10, color: colors.textMuted, fontWeight: "400" },
  emptyTable: { padding: 20, alignItems: "center" },
  emptyTableText: { fontSize: 12, color: colors.textMuted },

  summaryCard: {
    backgroundColor: "#F0FDF4",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryCol: { flex: 1, alignItems: "center" },
  summaryLabel: { fontSize: 11, fontWeight: "700", color: "#065F46" },
  summaryVal: { fontSize: 16, fontWeight: "800", color: colors.text, marginTop: 2 },
  summarySub: { fontSize: 10.5, color: colors.textMuted, marginTop: 2 },
  summaryDivider: { width: 1, height: "100%", backgroundColor: "#BBF7D0" },

  previewBox: {
    backgroundColor: "#1E293B",
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  previewHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  previewTitle: { fontSize: 12, fontWeight: "800", color: "#A7F3D0" },
  previewText: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 11,
    color: "#E2E8F0",
    lineHeight: 16,
  },

  footer: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: "#fff",
  },
  whatsAppBtn: {
    flex: 3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#25D366",
    paddingVertical: 12,
    borderRadius: radius.lg,
    ...shadow.sm,
  },
  whatsAppBtnText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  copyBtn: {
    flex: 1.2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: colors.primary50,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    paddingVertical: 12,
    borderRadius: radius.lg,
  },
  copyBtnText: { color: colors.primaryDark, fontSize: 12, fontWeight: "700" },
  cancelBtn: {
    flex: 1.2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
    paddingVertical: 12,
    borderRadius: radius.lg,
  },
  cancelBtnText: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
});
