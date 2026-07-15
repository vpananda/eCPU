import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { StatusPill } from "@/src/components/ui";

export default function CustomerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const confirmDelete = () => {
    setDeleteConfirmOpen(true);
  };

  const handleDelete = async () => {
    try {
      await api(`/customers/${id}`, { method: "DELETE" });
      toast.show("Customer deleted successfully");
      router.back();
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  };

  const load = useCallback(async () => {
    if (!id || id === "[id]") return;
    try {
      const d = await api<any>(`/customers/${id}`);
      setData(d);
    } catch (e: any) {
      toast.show(e.message || "Failed to load customer", "error");
    } finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return <SafeAreaView style={styles.safe}><ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} /></SafeAreaView>;
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Customer data not found.</Text>
          <TouchableOpacity style={styles.errorBtn} onPress={() => router.back()}>
            <Text style={styles.errorBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const s = data.stats || {};

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="customer-detail-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Customer</Text>
        {user?.role === "Admin" ? (
          <TouchableOpacity onPress={confirmDelete} testID="customer-delete">
            <MaterialCommunityIcons name="trash-can-outline" size={22} color={colors.danger} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 22 }} />
        )}
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.hero}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{data.name.slice(0, 1).toUpperCase()}</Text></View>
          <Text style={styles.name}>{data.name}</Text>
          <View style={styles.codePill}><Text style={styles.codeText}>{data.code}</Text></View>
          <Text style={styles.mobile}>{data.mobile}</Text>
          {data.village || data.district ? (
            <Text style={styles.location}>
              <MaterialCommunityIcons name="map-marker" size={12} color={colors.textMuted} /> {[data.village, data.taluk, data.district].filter(Boolean).join(", ")}
            </Text>
          ) : null}
          {data.branch_name && data.branch_name !== "-" ? (
            <Text style={styles.branch}>
              <MaterialCommunityIcons name="storefront" size={12} color={colors.primary} /> {data.branch_name}
            </Text>
          ) : null}
        </View>

        <View style={styles.statsGrid}>
          <Stat label="Visits" value={String(s.total_visits || 0)} icon="calendar-check" />
          <Stat label="Total Weight" value={`${(s.total_weight || 0).toFixed(0)}kg`} icon="weight-kilogram" />
          <Stat label="Revenue" value={`₹${(s.total_revenue || 0).toFixed(0)}`} icon="currency-inr" />
          <Stat label="Pending" value={`₹${(s.pending_balance || 0).toFixed(0)}`} icon="clock-alert-outline" danger={(s.pending_balance || 0) > 0} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>History</Text>
          {(data.history || []).length === 0 && <Text style={styles.empty}>No batches yet</Text>}
          {(data.history || []).map((b: any) => (
            <TouchableOpacity key={b.id} testID={`history-batch-${b.id}`} style={styles.batchRow} onPress={() => router.push(`/batch/${b.id}`)}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.batchNo}>{b.batch_no}</Text>
                  <StatusPill status={b.status} />
                </View>
                <Text style={styles.batchMeta}>{b.raw_weight}kg · ₹{b.bill_amount?.toFixed(0)} · Bal ₹{b.balance_amount?.toFixed(0)}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textLight} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Delete Confirmation Modal with Customer Details */}
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
              Are you sure you want to permanently delete this customer? This action cannot be undone.
            </Text>

            {/* Customer Details Panel */}
            <View style={styles.confirmDetailsBox}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Customer Code</Text>
                <Text style={styles.detailValue}>{data.code}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Name</Text>
                <Text style={styles.detailValue}>{data.name}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Mobile</Text>
                <Text style={styles.detailValue}>{data.mobile}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Branch</Text>
                <Text style={styles.detailValue}>{data.branch_name || "-"}</Text>
              </View>
              <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.detailLabel}>Total Visits</Text>
                <Text style={styles.detailValue}>{s.total_visits || 0}</Text>
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
                <Text style={styles.modalDeleteText}>Delete Customer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Stat({ label, value, icon, danger }: any) {
  return (
    <View style={styles.stat}>
      <MaterialCommunityIcons name={icon} size={18} color={danger ? colors.danger : colors.primary} />
      <Text style={[styles.statValue, danger && { color: colors.danger }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { fontSize: 18, fontWeight: "800", color: colors.text },
  hero: { alignItems: "center", padding: spacing.xl, gap: 4 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  avatarText: { fontSize: 32, fontWeight: "800", color: "#fff" },
  name: { fontSize: 22, fontWeight: "800", color: colors.text },
  codePill: { paddingHorizontal: 10, paddingVertical: 3, backgroundColor: colors.accent + "20", borderRadius: radius.pill, marginTop: 6 },
  codeText: { fontSize: 12, fontWeight: "800", color: colors.accent },
  mobile: { fontSize: 14, color: colors.textMuted, marginTop: 6 },
  location: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  branch: { fontSize: 12, color: colors.primary, fontWeight: "700", marginTop: 4 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: spacing.xl, gap: spacing.md, marginBottom: spacing.lg },
  stat: { width: "47.5%", backgroundColor: colors.card, padding: spacing.lg, borderRadius: radius.xl, ...shadow.card, gap: 4 },
  statValue: { fontSize: 18, fontWeight: "800", color: colors.text },
  statLabel: { fontSize: 12, color: colors.textMuted },
  section: { marginHorizontal: spacing.xl, backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.lg, ...shadow.card },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.text, marginBottom: spacing.md },
  empty: { fontSize: 13, color: colors.textMuted, textAlign: "center", paddingVertical: spacing.md },
  batchRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  batchNo: { fontSize: 14, fontWeight: "800", color: colors.text },
  batchMeta: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
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
});
