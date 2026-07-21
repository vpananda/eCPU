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
      const machines = await api<any[]>("/machines");
      setData(machines.find(m => m.id === id));
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
        {user?.role === "Admin" ? (
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => router.push({ pathname: "/machine-form", params: { id } })} testID="machine-edit" style={{ marginRight: 12 }}>
              <MaterialCommunityIcons name="pencil" size={22} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={confirmDelete} testID="machine-delete">
              <MaterialCommunityIcons name="trash-can-outline" size={22} color={colors.danger} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.headerBackBtnPlaceholder} />
        )}
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 80 }}>
        <View style={styles.hero}>
          <View style={[styles.iconBox, { backgroundColor: `${colors.status[data.status]}20` }]}>
            <MaterialCommunityIcons name="tumble-dryer" size={38} color={colors.status[data.status]} />
          </View>
          <Text style={styles.machineName}>{data.name}</Text>
          <Text style={styles.capacity}>Capacity: {data.capacity} kg</Text>
          <StatusPill status={data.status} />
        </View>

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
  iconBox: { width: 88, height: 88, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  machineName: { fontSize: 24, fontWeight: "800", color: colors.text },
  capacity: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.sm },
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
});
