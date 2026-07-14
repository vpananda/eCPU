import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import Calendar from "@/src/components/Calendar";
import { colors, radius, shadow, spacing } from "@/src/theme";

type Machine = {
  id: string;
  name: string;
  capacity: number;
  status: string;
};

type Batch = {
  id: string;
  batch_no: string;
  receipt_no: string;
  raw_weight: number;
  bags: number;
  customer?: { id: string; name: string; code: string };
  product?: { name: string };
  status: string;
};

function todayISOStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateTime(d: Date) {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  
  let hours = d.getHours();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  const min = String(d.getMinutes()).padStart(2, "0");
  
  return `${day}/${month}/${year}, ${String(hours).padStart(2, "0")}:${min} ${ampm}`;
}

export default function BatchingForm() {
  const router = useRouter();
  const { selectedBranchId } = useAuth();

  const [machines, setMachines] = useState<Machine[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedMachineId, setSelectedMachineId] = useState("");
  const [selectedBatchIds, setSelectedBatchIds] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  // Date and Time picker states
  const [processTime, setProcessTime] = useState(new Date());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [tempDateStr, setTempDateStr] = useState(todayISOStr(new Date()));
  const [tempHour, setTempHour] = useState(12);
  const [tempMinute, setTempMinute] = useState(0);
  const [tempAmPm, setTempAmPm] = useState<"AM" | "PM">("AM");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const branchParam = selectedBranchId ? `?branch_id=${selectedBranchId}` : "";
      const machs = await api<Machine[]>(`/machines${branchParam}`);
      setMachines(machs.filter(m => m.status === "Available"));

      const url = selectedBranchId 
        ? `/batches?status=Received&branch_id=${selectedBranchId}` 
        : "/batches?status=Received";
      const allBatches = await api<Batch[]>(url);
      setBatches(allBatches);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to load branch data");
    } finally {
      setLoading(false);
    }
  }, [selectedBranchId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const toggleBatchSelect = (id: string) => {
    setSelectedBatchIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const openDateTimePicker = () => {
    setTempDateStr(todayISOStr(processTime));
    let hr = processTime.getHours();
    const ampm = hr >= 12 ? "PM" : "AM";
    hr = hr % 12;
    hr = hr ? hr : 12;
    setTempHour(hr);
    setTempMinute(Math.round(processTime.getMinutes() / 5) * 5 % 60);
    setTempAmPm(ampm);
    setDatePickerOpen(true);
  };

  const incrementHour = (amount: number) => {
    setTempHour(prev => {
      let val = prev + amount;
      if (val > 12) return 1;
      if (val < 1) return 12;
      return val;
    });
  };

  const incrementMinute = (amount: number) => {
    setTempMinute(prev => {
      let val = prev + amount;
      if (val >= 60) return 0;
      if (val < 0) return 55;
      return val;
    });
  };

  const saveDateTime = () => {
    const [y, m, d] = tempDateStr.split("-").map(Number);
    let hr = tempHour;
    if (tempAmPm === "PM" && hr < 12) hr += 12;
    if (tempAmPm === "AM" && hr === 12) hr = 0;
    const newDate = new Date(y, m - 1, d, hr, tempMinute);
    setProcessTime(newDate);
    setDatePickerOpen(false);
  };

  const handleStartProcess = async () => {
    if (!selectedMachineId) {
      Alert.alert("Input Required", "Please select a dryer machine to run.");
      return;
    }

    const ids = Object.keys(selectedBatchIds).filter(id => selectedBatchIds[id]);
    if (ids.length === 0) {
      Alert.alert("Selection Required", "Please select at least one customer arrival stock to process.");
      return;
    }

    setSaving(true);
    try {
      await api(`/machines/${selectedMachineId}/load`, {
        method: "POST",
        body: { batch_ids: ids, start_time: processTime.toISOString() }
      });
      Alert.alert("Success", "Dryer loaded and process started successfully.");
      router.back();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to launch process");
    } finally {
      setSaving(false);
    }
  };

  const totalRawWeight = batches
    .filter(b => selectedBatchIds[b.id])
    .reduce((sum, b) => sum + (b.raw_weight || 0), 0);

  const selectedCount = Object.keys(selectedBatchIds).filter(id => selectedBatchIds[id]).length;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Batch Run</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Fetching branch resources...</Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            
            {/* 1. MACHINE SELECTOR */}
            <Text style={styles.sectionTitle}>1. Select Dryer Machine</Text>
            {machines.length === 0 ? (
              <View style={styles.warnBox}>
                <MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.danger} />
                <Text style={styles.warnText}>No available dryers found at this branch. Free up a dryer to load a new batch.</Text>
              </View>
            ) : (
              <View style={styles.machineList}>
                {machines.map(m => {
                  const isSelected = selectedMachineId === m.id;
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={[styles.machineCard, isSelected && styles.machineCardSelected]}
                      onPress={() => setSelectedMachineId(m.id)}
                      activeOpacity={0.9}
                    >
                      <View style={[styles.machineIconBox, { backgroundColor: isSelected ? colors.primary50 : "#f5f5f5" }]}>
                        <MaterialCommunityIcons name="generator-portable" size={22} color={isSelected ? colors.primary : colors.textMuted} />
                      </View>
                      <View style={{ flex: 1, marginLeft: spacing.sm }}>
                        <Text style={[styles.machineName, isSelected && styles.machineNameSelected]}>{m.name}</Text>
                        <Text style={styles.machineCap}>Capacity: {m.capacity} KG</Text>
                      </View>
                      {isSelected && <MaterialCommunityIcons name="check-circle" size={22} color={colors.primary} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* 2. DATE TIME SELECTOR */}
            <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>2. Select Process Start Time</Text>
            <TouchableOpacity
              style={styles.dateTimeField}
              onPress={openDateTimePicker}
              activeOpacity={0.9}
            >
              <View style={styles.dateTimeIconBox}>
                <MaterialCommunityIcons name="clock-outline" size={20} color={colors.primary} />
              </View>
              <Text style={styles.dateTimeText}>{formatDateTime(processTime)}</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
            </TouchableOpacity>

            {/* 3. ARRIVALS SELECTOR */}
            <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>3. Select Arrivals ({batches.length} pending)</Text>
            {batches.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="package-variant" size={40} color={colors.textMuted} />
                <Text style={styles.emptyText}>No pending arrivals at this branch.</Text>
              </View>
            ) : (
              batches.map(b => {
                const isSelected = !!selectedBatchIds[b.id];
                return (
                  <TouchableOpacity
                    key={b.id}
                    style={[styles.arrivalCard, isSelected && styles.arrivalCardSelected]}
                    onPress={() => toggleBatchSelect(b.id)}
                    activeOpacity={0.9}
                  >
                    <View style={styles.arrivalCardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.customerName}>{b.customer?.name || "Unknown Customer"}</Text>
                        <Text style={styles.batchNo}>{b.batch_no} • {b.product?.name || "N/A"}</Text>
                      </View>
                      <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                        {isSelected && <MaterialCommunityIcons name="check" size={16} color="#fff" />}
                      </View>
                    </View>
                    <View style={styles.arrivalDivider} />
                    <View style={styles.arrivalMeta}>
                      <Text style={styles.metaLabel}>Raw: <Text style={styles.metaVal}>{b.raw_weight} KG</Text></Text>
                      <Text style={styles.metaLabel}>Bags: <Text style={styles.metaVal}>{b.bags} Bags</Text></Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}

          </ScrollView>

          {/* 3. CONFIRM ACTION BAR */}
          <View style={styles.buttonBar}>
            <View style={styles.summaryInfo}>
              <Text style={styles.summaryLabel}>Selected: {selectedCount} arrivals</Text>
              <Text style={styles.summaryVal}>Weight: {totalRawWeight.toFixed(2)} KG</Text>
            </View>
            <TouchableOpacity
              style={[styles.actionBtn, (saving || !selectedMachineId || selectedCount === 0) && styles.actionBtnDisabled]}
              onPress={handleStartProcess}
              disabled={saving || !selectedMachineId || selectedCount === 0}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <MaterialCommunityIcons name="play-circle" size={20} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.actionBtnText}>Start Drying</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

        </View>
      )}

      {/* DateTime Picker Modal */}
      <Modal
        visible={datePickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setDatePickerOpen(false)}
      >
        <View style={styles.dateModalBg}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerSheetHandle} />
            <Text style={styles.pickerSheetTitle}>Select Process Start Time</Text>

            <Calendar
              startDate={tempDateStr}
              endDate={tempDateStr}
              onSelectRange={(s, e) => {
                setTempDateStr(s);
              }}
            />

            <Text style={styles.timeSectionTitle}>Time</Text>
            <View style={styles.timePickerRow}>
              <View style={styles.timeCol}>
                <TouchableOpacity onPress={() => incrementHour(-1)} style={styles.timeBtn}>
                  <MaterialCommunityIcons name="minus" size={16} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.timeValue}>{String(tempHour).padStart(2, "0")}</Text>
                <TouchableOpacity onPress={() => incrementHour(1)} style={styles.timeBtn}>
                  <MaterialCommunityIcons name="plus" size={16} color={colors.text} />
                </TouchableOpacity>
              </View>

              <Text style={styles.timeColon}>:</Text>

              <View style={styles.timeCol}>
                <TouchableOpacity onPress={() => incrementMinute(-5)} style={styles.timeBtn}>
                  <MaterialCommunityIcons name="minus" size={16} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.timeValue}>{String(tempMinute).padStart(2, "0")}</Text>
                <TouchableOpacity onPress={() => incrementMinute(5)} style={styles.timeBtn}>
                  <MaterialCommunityIcons name="plus" size={16} color={colors.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.ampmCol}>
                <TouchableOpacity
                  style={[styles.ampmBtn, tempAmPm === "AM" && styles.ampmBtnActive]}
                  onPress={() => setTempAmPm("AM")}
                >
                  <Text style={[styles.ampmText, tempAmPm === "AM" && styles.ampmTextActive]}>AM</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.ampmBtn, tempAmPm === "PM" && styles.ampmBtnActive]}
                  onPress={() => setTempAmPm("PM")}
                >
                  <Text style={[styles.ampmText, tempAmPm === "PM" && styles.ampmTextActive]}>PM</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.pickerSheetActions}>
              <TouchableOpacity style={styles.pickerSheetCancel} onPress={() => setDatePickerOpen(false)}>
                <Text style={styles.pickerSheetCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pickerSheetApply} onPress={saveDateTime}>
                <Text style={styles.pickerSheetApplyText}>Apply</Text>
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
  headerTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  loadingText: { marginTop: spacing.md, color: colors.textMuted, fontSize: 14, fontWeight: "600" },
  scroll: { padding: spacing.lg, paddingBottom: 120 },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: spacing.md },
  warnBox: {
    flexDirection: "row",
    backgroundColor: "#FFEBEE",
    borderWidth: 1,
    borderColor: "#FFCDD2",
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    gap: spacing.sm,
  },
  warnText: { flex: 1, fontSize: 12, color: colors.danger, fontWeight: "600", lineHeight: 18 },
  emptyState: { paddingVertical: 30, alignItems: "center", justifyContent: "center", backgroundColor: "#fff", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  emptyText: { marginTop: spacing.sm, color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  machineList: { gap: spacing.sm },
  machineCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.card,
  },
  machineCardSelected: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}05`,
  },
  machineIconBox: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  machineName: { fontSize: 15, fontWeight: "800", color: colors.text },
  machineNameSelected: { color: colors.primary },
  machineCap: { fontSize: 12, color: colors.textMuted, marginTop: 2, fontWeight: "500" },
  dateTimeField: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.card,
  },
  dateTimeIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: `${colors.primary}12`,
    alignItems: "center",
    justifyContent: "center",
  },
  dateTimeText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    marginLeft: spacing.sm,
  },
  arrivalCard: {
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  arrivalCardSelected: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}05`,
  },
  arrivalCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  customerName: { fontSize: 14, fontWeight: "800", color: colors.text },
  batchNo: { fontSize: 11, color: colors.textMuted, marginTop: 2, fontWeight: "500" },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  arrivalDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  arrivalMeta: { flexDirection: "row", gap: spacing.md },
  metaLabel: { fontSize: 12, color: colors.textMuted, fontWeight: "500" },
  metaVal: { fontWeight: "700", color: colors.text },
  buttonBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    ...shadow.card,
  },
  summaryInfo: { flex: 1 },
  summaryLabel: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  summaryVal: { fontSize: 14, fontWeight: "800", color: colors.text, marginTop: 2 },
  actionBtn: {
    flex: 1.2,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  actionBtnDisabled: { opacity: 0.6 },
  actionBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  // DateTime Modal Styles
  dateModalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  pickerSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  pickerSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  pickerSheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    marginBottom: spacing.md,
    textAlign: "center",
  },
  timeSectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.textMuted,
    textTransform: "uppercase",
    marginTop: spacing.md,
    marginBottom: 6,
    textAlign: "center",
  },
  timePickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  timeCol: {
    alignItems: "center",
    flexDirection: "row",
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 8,
  },
  timeBtn: {
    padding: 6,
  },
  timeValue: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
    minWidth: 24,
    textAlign: "center",
  },
  timeColon: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
  },
  ampmCol: {
    flexDirection: "row",
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  ampmBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  ampmBtnActive: {
    backgroundColor: colors.primary,
  },
  ampmText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.textMuted,
  },
  ampmTextActive: {
    color: "#fff",
  },
  pickerSheetActions: {
    flexDirection: "row",
    gap: spacing.md,
  },
  pickerSheetCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
  },
  pickerSheetCancelText: {
    color: colors.textMuted,
    fontWeight: "700",
  },
  pickerSheetApply: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  pickerSheetApplyText: {
    color: "#fff",
    fontWeight: "800",
  },
});
