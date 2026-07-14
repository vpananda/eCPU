import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, radius, shadow, spacing } from "@/src/theme";

type RunningBatch = {
  id: string;
  batch_no: string;
  customer_name: string;
  raw_weight: number;
  bags: number;
};

type Machine = {
  id: string;
  name: string;
  status: string;
  running_batches?: RunningBatch[];
};

export default function StopDryer() {
  const router = useRouter();
  const { machineId, machineName } = useLocalSearchParams<{ machineId: string; machineName: string }>();

  const [machine, setMachine] = useState<Machine | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [dryWeightInput, setDryWeightInput] = useState("");
  const [dryBagsInput, setDryBagsInput] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchMachineDetails = useCallback(async () => {
    setLoading(true);
    try {
      const all = await api<Machine[]>("/machines");
      const found = all.find(m => m.id === machineId);
      if (found) {
        setMachine(found);
      } else {
        Alert.alert("Error", "Machine details not found.");
        router.back();
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to fetch machine info");
    } finally {
      setLoading(false);
    }
  }, [machineId]);

  useFocusEffect(
    useCallback(() => {
      fetchMachineDetails();
    }, [fetchMachineDetails])
  );

  const runningBatches = machine?.running_batches || [];
  const totalRawWeight = useMemo(() => {
    return runningBatches.reduce((sum, b) => sum + (b.raw_weight || 0), 0);
  }, [runningBatches]);

  const totalRawBags = useMemo(() => {
    return runningBatches.reduce((sum, b) => sum + (b.bags || 0), 0);
  }, [runningBatches]);

  const parsedDryWeight = parseFloat(dryWeightInput) || 0;
  const parsedDryBags = parseInt(dryBagsInput, 10) || 0;

  // Proportional distribution calculations for preview
  const previewData = useMemo(() => {
    if (totalRawWeight === 0) return [];
    return runningBatches.map(b => {
      const pct = b.raw_weight / totalRawWeight;
      const propWeight = pct * parsedDryWeight;
      const propBags = Math.round(pct * parsedDryBags);
      return {
        ...b,
        propWeight: propWeight.toFixed(2),
        propBags: propBags
      };
    });
  }, [runningBatches, totalRawWeight, parsedDryWeight, parsedDryBags]);

  const handleStop = async () => {
    if (parsedDryWeight <= 0) {
      Alert.alert("Invalid Input", "Please enter a valid total dried weight (> 0).");
      return;
    }
    if (parsedDryBags <= 0) {
      Alert.alert("Invalid Input", "Please enter a valid total processed bag count (> 0).");
      return;
    }

    setSaving(true);
    try {
      await api(`/machines/${machineId}/stop`, {
        method: "POST",
        body: {
          total_dry_weight: parsedDryWeight,
          total_dry_bags: parsedDryBags
        }
      });
      Alert.alert("Success", "Dryer stopped and dry weights recorded successfully.");
      router.back();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to stop dryer");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {/* Custom Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Stop Machine</Text>
          <Text style={styles.headerSub}>{machineName || "Dryer"}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Fetching active drying run...</Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Run Summary Card */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Active Run Summary</Text>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryMeta}>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Loaded Customers</Text>
                  <Text style={styles.metaVal}>{runningBatches.length}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Total Raw Weight</Text>
                  <Text style={styles.metaVal}>{totalRawWeight.toFixed(2)} KG</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Total Input Bags</Text>
                  <Text style={styles.metaVal}>{totalRawBags} Bags</Text>
                </View>
              </View>
            </View>

            {/* Inputs Block */}
            <Text style={styles.sectionTitle}>Process Output Details</Text>
            <View style={styles.inputGroup}>
              <View style={styles.inputCol}>
                <Text style={styles.inputLabel}>Total Dried Weight (KG)</Text>
                <TextInput
                  style={styles.textInput}
                  value={dryWeightInput}
                  onChangeText={setDryWeightInput}
                  keyboardType="numeric"
                  placeholder="0.00"
                  placeholderTextColor={colors.textLight}
                />
              </View>
              <View style={styles.inputCol}>
                <Text style={styles.inputLabel}>Total Output Bags</Text>
                <TextInput
                  style={styles.textInput}
                  value={dryBagsInput}
                  onChangeText={setDryBagsInput}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.textLight}
                />
              </View>
            </View>

            {/* Proportional Distribution Preview List */}
            {previewData.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Proportional Output Preview</Text>
                {previewData.map(b => (
                  <View key={b.id} style={styles.previewCard}>
                    <View style={styles.previewCardHeader}>
                      <Text style={styles.previewCustName}>{b.customer_name}</Text>
                      <Text style={styles.previewBatchNo}>{b.batch_no}</Text>
                    </View>
                    <View style={styles.previewCardDivider} />
                    <View style={styles.previewStats}>
                      <View style={styles.statBox}>
                        <Text style={styles.statLabel}>Raw Weight</Text>
                        <Text style={styles.statVal}>{b.raw_weight} KG</Text>
                      </View>
                      <View style={styles.statBox}>
                        <Text style={styles.statLabel}>Est. Dried</Text>
                        <Text style={[styles.statVal, { color: colors.primary }]}>{b.propWeight} KG</Text>
                      </View>
                      <View style={styles.statBox}>
                        <Text style={styles.statLabel}>Est. Bags</Text>
                        <Text style={styles.statVal}>{b.propBags} Bags</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </>
            )}
          </ScrollView>

          {/* Action Bar */}
          <View style={styles.buttonBar}>
            <TouchableOpacity
              style={[styles.stopBtn, saving && styles.stopBtnDisabled]}
              onPress={handleStop}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <MaterialCommunityIcons name="stop-circle" size={20} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.stopBtnText}>Complete Drying Process</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
  headerTitleContainer: { alignItems: "center" },
  headerTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  headerSub: { fontSize: 13, color: colors.textMuted, marginTop: 1, fontWeight: "500" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  loadingText: { marginTop: spacing.md, color: colors.textMuted, fontSize: 14, fontWeight: "600" },
  scroll: { padding: spacing.lg, paddingBottom: 100 },
  summaryCard: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadow.card,
  },
  summaryTitle: { fontSize: 14, fontWeight: "800", color: colors.text },
  summaryDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  summaryMeta: { gap: 6 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  metaLabel: { fontSize: 12, color: colors.textMuted, fontWeight: "500" },
  metaVal: { fontSize: 13, fontWeight: "700", color: colors.text },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: spacing.sm, marginTop: spacing.md },
  inputGroup: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  inputCol: { flex: 1 },
  inputLabel: { fontSize: 11, fontWeight: "800", color: colors.textMuted, marginBottom: 6, textTransform: "uppercase" },
  textInput: {
    backgroundColor: "#fff",
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    fontWeight: "700",
  },
  previewCard: {
    backgroundColor: "#fff",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  previewCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  previewCustName: { fontSize: 13, fontWeight: "800", color: colors.text },
  previewBatchNo: { fontSize: 11, color: colors.textMuted, fontWeight: "600" },
  previewCardDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  previewStats: { flexDirection: "row", justifyContent: "space-between" },
  statBox: { flex: 1, alignItems: "center" },
  statLabel: { fontSize: 9, fontWeight: "800", color: colors.textMuted, textTransform: "uppercase" },
  statVal: { fontSize: 12, fontWeight: "700", color: colors.text, marginTop: 2 },
  buttonBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.card,
  },
  stopBtn: {
    backgroundColor: colors.danger,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  stopBtnDisabled: { opacity: 0.7 },
  stopBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
