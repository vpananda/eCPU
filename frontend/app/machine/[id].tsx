import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect, Stack } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { StatusPill } from "@/src/components/ui";
import { Button } from "@/src/components/Button";

const STATUSES = ["Available", "Running", "Maintenance", "Cleaning"];

export default function MachineDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async () => {
    if (!id || id === "[id]") return;
    try {
      const m = await api<any>(`/machines/${id}`);
      setData(m);
    } catch (e: any) {
      toast.show(e.message || "Failed to load machine detail", "error");
    } finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const confirmDelete = () => {
    setDeleteConfirmOpen(true);
  };

  const handleDelete = async () => {
    try {
      await api(`/machines/${id}`, { method: "DELETE" });
      toast.show("Machine deleted successfully");
      router.back();
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  };

  const setStatus = async (status: string) => {
    setUpdating(true);
    try {
      await api(`/machines/${id}/status`, { method: "PUT", body: { status } });
      toast.show(`Machine set to ${status}`);
      await load();
    } catch (e: any) { toast.show(e.message, "error"); }
    finally { setUpdating(false); }
  };

  if (loading) {
    return <SafeAreaView style={styles.safe}><ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} /></SafeAreaView>;
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Machine details not found.</Text>
          <TouchableOpacity style={styles.errorBtn} onPress={() => router.back()}>
            <Text style={styles.errorBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBackBtn} testID="machine-detail-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{data.name}</Text>
        {(user?.role === "Admin" || user?.role === "Manager") ? (
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => router.push({ pathname: "/machine-form", params: { id } })} testID="machine-edit" style={{ marginRight: 12 }}>
              <MaterialCommunityIcons name="pencil" size={22} color={colors.primary} />
            </TouchableOpacity>
            {user?.role === "Admin" && (
              <TouchableOpacity onPress={confirmDelete} testID="machine-delete">
                <MaterialCommunityIcons name="trash-can-outline" size={22} color={colors.danger} />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.headerBackBtnPlaceholder} />
        )}
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 80 }}>
        <View style={[styles.hero, data.is_outsourced && styles.heroOutsourced]}>
          <View style={[styles.iconBox, { backgroundColor: data.is_outsourced ? "#FFE08250" : `${colors.status[data.status]}20` }]}>
            <MaterialCommunityIcons
              name={data.is_outsourced ? "truck-delivery-outline" : "tumble-dryer"}
              size={38}
              color={data.is_outsourced ? "#E65100" : colors.status[data.status]}
            />
          </View>
          <Text style={styles.machineName}>{data.name}</Text>
          <Text style={styles.capacity}>Capacity: {data.capacity} kg</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={[styles.typeBadge, data.is_outsourced ? styles.typeBadgeOutsourced : styles.typeBadgeInhouse]}>
              <Text style={[styles.typeBadgeText, data.is_outsourced ? styles.typeBadgeTextOutsourced : styles.typeBadgeTextInhouse]}>
                {data.is_outsourced ? "Outsourced Dryer" : "In-House Machine"}
              </Text>
            </View>
            <StatusPill status={data.status} />
          </View>
        </View>

        {/* Vendor Details Card for Outsourced Dryer */}
        {data.is_outsourced && (
          <View style={styles.vendorCard}>
            <View style={styles.vendorHeader}>
              <MaterialCommunityIcons name="office-building" size={20} color="#E65100" />
              <Text style={styles.vendorTitle}>Outsourcing Vendor Details</Text>
            </View>
            <View style={styles.vendorRow}>
              <Text style={styles.vendorLabel}>Vendor / Firm Name</Text>
              <Text style={styles.vendorValue}>{data.vendor_name || "—"}</Text>
            </View>
            <View style={styles.vendorRow}>
              <Text style={styles.vendorLabel}>Contact Phone</Text>
              <Text style={styles.vendorValue}>{data.vendor_phone || "—"}</Text>
            </View>
            <View style={[styles.vendorRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.vendorLabel}>Job-Work Cost / Rate</Text>
              <Text style={[styles.vendorValue, { color: "#E65100", fontWeight: "800" }]}>
                {data.vendor_rate_per_kg ? `₹${data.vendor_rate_per_kg} / kg` : "—"}
              </Text>
            </View>
          </View>
        )}

        {/* Outsource Job-Work & Financial Settlement Card */}
        {data.is_outsourced && data.outsourcing_ledger && (
          <View style={styles.settlementCard}>
            <View style={styles.settlementHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={styles.settlementIconBox}>
                  <MaterialCommunityIcons name="calculator-variant" size={20} color="#E65100" />
                </View>
                <View>
                  <Text style={styles.settlementTitle}>Outsource Financial Ledger</Text>
                  <Text style={styles.settlementSub}>Processing weight, job cost & payouts</Text>
                </View>
              </View>
            </View>

            {/* Metrics Grid */}
            <View style={styles.settlementMetricsGrid}>
              <View style={styles.settlementMetric}>
                <Text style={styles.settlementMetricLabel}>Processed Weight</Text>
                <Text style={styles.settlementMetricVal}>
                  {Number(data.outsourcing_ledger.total_processed_kg || 0).toLocaleString("en-IN")} kg
                </Text>
                <Text style={styles.settlementMetricSub}>
                  {data.outsourcing_ledger.batches?.length || 0} batches
                </Text>
              </View>

              <View style={styles.settlementDivider} />

              <View style={styles.settlementMetric}>
                <Text style={styles.settlementMetricLabel}>Job Rate</Text>
                <Text style={styles.settlementMetricVal}>
                  ₹{Number(data.outsourcing_ledger.vendor_rate_per_kg || 0).toLocaleString("en-IN")}/kg
                </Text>
                <Text style={styles.settlementMetricSub}>Contract Rate</Text>
              </View>
            </View>

            <View style={[styles.settlementMetricsGrid, { borderTopWidth: 1, borderTopColor: "#FFE082", paddingTop: 10, marginTop: 4 }]}>
              <View style={styles.settlementMetric}>
                <Text style={styles.settlementMetricLabel}>Total Job Cost</Text>
                <Text style={[styles.settlementMetricVal, { color: colors.text }]}>
                  ₹{Number(data.outsourcing_ledger.total_job_cost || 0).toLocaleString("en-IN")}
                </Text>
                <Text style={styles.settlementMetricSub}>Accrued Payable</Text>
              </View>

              <View style={styles.settlementDivider} />

              <View style={styles.settlementMetric}>
                <Text style={styles.settlementMetricLabel}>Total Paid</Text>
                <Text style={[styles.settlementMetricVal, { color: colors.success }]}>
                  ₹{Number(data.outsourcing_ledger.total_paid || 0).toLocaleString("en-IN")}
                </Text>
                <Text style={styles.settlementMetricSub}>Vendor Payouts</Text>
              </View>
            </View>

            {/* Balance Due Row */}
            <View style={styles.settlementBalanceRow}>
              <View>
                <Text style={styles.settlementBalanceLabel}>Balance Due to Vendor</Text>
                <Text style={styles.settlementBalanceSub}>
                  {data.outsourcing_ledger.balance_payable > 0 ? "Pending Payment" : "Settled / No Pending Due"}
                </Text>
              </View>
              <Text
                style={[
                  styles.settlementBalanceVal,
                  data.outsourcing_ledger.balance_payable > 0 ? { color: "#C62828" } : { color: colors.success },
                ]}
              >
                ₹{Number(data.outsourcing_ledger.balance_payable || 0).toLocaleString("en-IN")}
              </Text>
            </View>

            {/* Pay Vendor Button */}
            <TouchableOpacity
              testID="pay-vendor-btn"
              style={styles.payVendorBtn}
              onPress={() => {
                router.push({
                  pathname: "/expense-form",
                  params: {
                    category: "Outsourced Drying",
                    vendor: data.vendor_name || data.name,
                    branch_id: data.branch_id,
                    machine_id: data.id,
                    suggest_amount:
                      data.outsourcing_ledger.balance_payable > 0
                        ? String(data.outsourcing_ledger.balance_payable)
                        : "",
                    remarks: `Outsourced drying charges for ${data.name} (${data.outsourcing_ledger.total_processed_kg} kg @ ₹${data.outsourcing_ledger.vendor_rate_per_kg}/kg)`,
                  },
                });
              }}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="credit-card-plus-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.payVendorBtnText}>Pay Vendor / Record Expense</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Processed Batches Section for Outsourced Dryer */}
        {data.is_outsourced && data.outsourcing_ledger && (
          <View style={styles.batchesSection}>
            <Text style={styles.sectionTitle}>
              Processed Batches ({data.outsourcing_ledger.batches?.length || 0})
            </Text>

            {(!data.outsourcing_ledger.batches || data.outsourcing_ledger.batches.length === 0) ? (
              <View style={styles.emptyCard}>
                <MaterialCommunityIcons name="package-variant" size={28} color={colors.textMuted} />
                <Text style={styles.emptyCardText}>No batches processed in this dryer yet.</Text>
              </View>
            ) : (
              data.outsourcing_ledger.batches.map((b: any) => {
                const batchCost = Number(b.raw_weight || 0) * Number(data.outsourcing_ledger.vendor_rate_per_kg || 0);
                return (
                  <TouchableOpacity
                    key={b.id}
                    style={styles.batchCard}
                    onPress={() => router.push(`/batch/${b.id}`)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.batchCardTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.batchCardNo}>{b.batch_no}</Text>
                        <Text style={styles.batchCardCust}>{b.customer_name || "Unknown Customer"}</Text>
                      </View>
                      <StatusPill status={b.status} />
                    </View>
                    <View style={styles.batchCardDivider} />
                    <View style={styles.batchCardBottom}>
                      <View>
                        <Text style={styles.batchCardMetaLabel}>Processed Weight</Text>
                        <Text style={styles.batchCardMetaVal}>{Number(b.raw_weight || 0).toLocaleString("en-IN")} kg</Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={styles.batchCardMetaLabel}>Job-Work Cost</Text>
                        <Text style={[styles.batchCardMetaVal, { color: "#E65100" }]}>
                          ₹{batchCost.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}

            {/* Payout History */}
            {data.outsourcing_ledger.payouts && data.outsourcing_ledger.payouts.length > 0 && (
              <View style={{ marginTop: spacing.lg }}>
                <Text style={styles.sectionTitle}>
                  Payout History ({data.outsourcing_ledger.payouts.length})
                </Text>
                {data.outsourcing_ledger.payouts.map((p: any) => (
                  <View key={p.id} style={styles.payoutCard}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={styles.payoutAmount}>₹{Number(p.amount || 0).toLocaleString("en-IN")}</Text>
                        <View style={styles.modePill}>
                          <Text style={styles.modePillText}>{p.payment_mode || "Cash"}</Text>
                        </View>
                      </View>
                      <Text style={styles.payoutDate}>
                        {p.expense_date ? p.expense_date.slice(0, 10) : p.created_at ? p.created_at.slice(0, 10) : "—"}
                      </Text>
                      {p.remarks ? <Text style={styles.payoutRemarks}>{p.remarks}</Text> : null}
                    </View>
                    <MaterialCommunityIcons name="check-circle" size={20} color={colors.success} />
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {data.current_batch ? (
          <TouchableOpacity
            testID="machine-current-batch"
            style={styles.currentBatch}
            onPress={() => router.push(`/batch/${data.current_batch.id}`)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.currentLabel}>Current Batch</Text>
              <Text style={styles.currentBatchNo}>{data.current_batch.batch_no}</Text>
              <Text style={styles.currentCust}>{data.current_batch.customer_name}</Text>
            </View>
            <MaterialCommunityIcons name="arrow-right" size={22} color={colors.primary} />
          </TouchableOpacity>
        ) : null}

        <Text style={styles.sectionTitle}>Change Status</Text>
        <View style={styles.statusGrid}>
          {STATUSES.map(s => (
            <TouchableOpacity
              key={s}
              testID={`machine-status-${s.toLowerCase()}`}
              style={[styles.statusChip, data.status === s && { backgroundColor: colors.status[s], borderColor: colors.status[s] }]}
              disabled={updating}
              onPress={() => setStatus(s)}
            >
              <Text style={[styles.statusText, data.status === s && { color: "#fff" }]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Button testID="machine-log-maintenance" title="Log Maintenance" variant="outline" onPress={() => router.push({ pathname: "/maintenance-form", params: { machine_id: id } })} style={{ marginTop: spacing.xl }} />
      </ScrollView>

      {/* Delete Confirmation Modal with Machine Details */}
      <Modal
        visible={deleteConfirmOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setDeleteConfirmOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setDeleteConfirmOpen(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Confirm Deletion</Text>
            
            <Text style={styles.deleteWarningText}>
              Are you sure you want to permanently delete this machine? This action cannot be undone.
            </Text>

            {/* Machine Details Panel */}
            <View style={styles.confirmDetailsBox}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Machine Name</Text>
                <Text style={styles.detailValue}>{data.name}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Capacity</Text>
                <Text style={styles.detailValue}>{data.capacity} kg</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Current Status</Text>
                <Text style={[styles.detailValue, { color: colors.status[data.status], fontWeight: "800" }]}>
                  {data.status}
                </Text>
              </View>
              <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.detailLabel}>Branch</Text>
                <Text style={styles.detailValue}>{data.branch_name || "Main Branch"}</Text>
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setDeleteConfirmOpen(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalDeleteBtn}
                onPress={() => {
                  setDeleteConfirmOpen(false);
                  handleDelete();
                }}
              >
                <Text style={styles.modalDeleteText}>Delete Machine</Text>
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
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  headerBackBtn: { width: 60, alignItems: "flex-start", justifyContent: "center" },
  headerBackBtnPlaceholder: { width: 60 },
  headerActions: { width: 60, flexDirection: "row", alignItems: "center", justifyContent: "flex-end" },
  title: { fontSize: 20, fontWeight: "800", color: colors.text, textAlign: "center", flex: 1, marginHorizontal: spacing.xs },
  hero: { alignItems: "center", padding: spacing.xl, gap: 6, backgroundColor: colors.card, borderRadius: radius.xxl, marginBottom: spacing.lg, ...shadow.card },
  heroOutsourced: { borderWidth: 1.5, borderColor: "#FFA726", backgroundColor: "#FFFCF5" },
  iconBox: { width: 88, height: 88, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  machineName: { fontSize: 24, fontWeight: "800", color: colors.text },
  capacity: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.sm },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  typeBadgeInhouse: {
    backgroundColor: `${colors.primary}15`,
  },
  typeBadgeOutsourced: {
    backgroundColor: "#FFE08260",
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  typeBadgeTextInhouse: {
    color: colors.primary,
  },
  typeBadgeTextOutsourced: {
    color: "#E65100",
  },
  vendorCard: {
    backgroundColor: "#FFFDF9",
    borderWidth: 1.5,
    borderColor: "#FFE082",
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  vendorHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#FFE082",
    marginBottom: spacing.sm,
  },
  vendorTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#E65100",
  },
  vendorRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#FFF3E0",
  },
  vendorLabel: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "600",
  },
  vendorValue: {
    fontSize: 13,
    color: colors.text,
    fontWeight: "700",
  },
  currentBatch: { flexDirection: "row", alignItems: "center", backgroundColor: colors.primary50, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.lg, gap: spacing.md },
  currentLabel: { fontSize: 11, fontWeight: "800", color: colors.primary, letterSpacing: 0.4, textTransform: "uppercase" },
  currentBatchNo: { fontSize: 18, fontWeight: "800", color: colors.text, marginTop: 4 },
  currentCust: { fontSize: 13, color: colors.textMuted },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: colors.textMuted, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: spacing.md },
  statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusChip: { paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border },
  statusText: { fontSize: 13, color: colors.text, fontWeight: "700" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  modalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  deleteWarningText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  confirmDetailsBox: {
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  detailLabel: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: "600",
  },
  detailValue: {
    fontSize: 13,
    color: colors.text,
    fontWeight: "700",
  },
  modalActions: {
    flexDirection: "row",
    gap: spacing.md,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textMuted,
  },
  modalDeleteBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  modalDeleteText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#fff",
  },
  errorContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.xl, gap: spacing.md },
  errorText: { fontSize: 16, color: colors.textMuted, textAlign: "center", fontWeight: "600" },
  errorBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.primary, borderRadius: radius.pill },
  errorBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  settlementCard: {
    backgroundColor: "#FFFDF7",
    borderRadius: radius.xxl,
    borderWidth: 1.5,
    borderColor: "#FFE082",
    padding: spacing.lg,
    marginBottom: spacing.xl,
    ...shadow.card,
  },
  settlementHeader: {
    marginBottom: spacing.md,
  },
  settlementIconBox: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: "#FFE082",
    alignItems: "center",
    justifyContent: "center",
  },
  settlementTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#E65100",
  },
  settlementSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  settlementMetricsGrid: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  settlementMetric: {
    flex: 1,
    alignItems: "center",
  },
  settlementMetricLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  settlementMetricVal: {
    fontSize: 18,
    fontWeight: "800",
    color: "#E65100",
    marginTop: 2,
  },
  settlementMetricSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  settlementDivider: {
    width: 1,
    height: 32,
    backgroundColor: "#FFE082",
  },
  settlementBalanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFF8E1",
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#FFE082",
    marginTop: 12,
    marginBottom: spacing.md,
  },
  settlementBalanceLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
  },
  settlementBalanceSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  settlementBalanceVal: {
    fontSize: 20,
    fontWeight: "800",
  },
  payVendorBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E65100",
    paddingVertical: 12,
    borderRadius: radius.pill,
    ...shadow.card,
  },
  payVendorBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  batchesSection: {
    marginBottom: spacing.xl,
  },
  emptyCard: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  emptyCardText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  batchCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.card,
  },
  batchCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  batchCardNo: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
  },
  batchCardCust: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  batchCardDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
  batchCardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  batchCardMetaLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "600",
  },
  batchCardMetaVal: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    marginTop: 2,
  },
  payoutCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FBF9",
    borderWidth: 1,
    borderColor: "#E8EFE8",
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  payoutAmount: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.success,
  },
  payoutDate: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  payoutRemarks: {
    fontSize: 12,
    color: colors.text,
    marginTop: 3,
  },
  modePill: {
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  modePillText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.success,
    textTransform: "uppercase",
  },
});
