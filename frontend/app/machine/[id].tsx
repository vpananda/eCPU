import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
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
    try {
      const machines = await api<any[]>("/machines");
      setData(machines.find(m => m.id === id));
    } finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const confirmDelete = () => {
    Alert.alert(
      "Delete Machine",
      "Are you sure you want to delete this machine? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: handleDelete }
      ]
    );
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

  if (loading || !data) {
    return <SafeAreaView style={styles.safe}><ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="machine-detail-back">
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
          <View style={{ width: 22 }} />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  headerActions: { flexDirection: "row", alignItems: "center" },
  title: { fontSize: 20, fontWeight: "800", color: colors.text, textAlign: "center", flex: 1 },
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
});
