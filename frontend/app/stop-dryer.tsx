import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import Calendar from "@/src/components/Calendar";
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

export default function StopDryer() {
  const router = useRouter();
  const { machineId, machineName } = useLocalSearchParams<{ machineId: string; machineName: string }>();

  const [machine, setMachine] = useState<Machine | null>(null);
  const [loading, setLoading] = useState(true);
  
  // DateTime picker states
  const [stopTime, setStopTime] = useState(new Date());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [tempDateStr, setTempDateStr] = useState(todayISOStr(new Date()));
  const [tempHour, setTempHour] = useState(12);
  const [tempMinute, setTempMinute] = useState(0);
  const [tempAmPm, setTempAmPm] = useState<"AM" | "PM">("AM");
  const [saving, setSaving] = useState(false);

  const openDateTimePicker = () => {
    setTempDateStr(todayISOStr(stopTime));
    let hr = stopTime.getHours();
    const ampm = hr >= 12 ? "PM" : "AM";
    hr = hr % 12;
    hr = hr ? hr : 12;
    setTempHour(hr);
    setTempMinute(Math.round(stopTime.getMinutes() / 5) * 5 % 60);
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
    setStopTime(newDate);
    setDatePickerOpen(false);
  };

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

  const handleStop = async () => {
    setSaving(true);
    try {
      await api(`/machines/${machineId}/stop`, {
        method: "POST",
        body: {
          end_time: stopTime.toISOString()
        }
      });
      Alert.alert("Success", "Dryer stopped successfully.");
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

            {/* DateTime Picker */}
            <Text style={styles.sectionTitle}>1. Dryer Stop Time</Text>
            <TouchableOpacity style={styles.dateTimeField} onPress={openDateTimePicker}>
              <View style={styles.dateTimeIconBox}>
                <MaterialCommunityIcons name="clock-outline" size={20} color={colors.primary} />
              </View>
              <Text style={styles.dateTimeText}>{formatDateTime(stopTime)}</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
            </TouchableOpacity>

            {/* Loaded Customer Details List */}
            {runningBatches.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>2. Loaded Customer Details</Text>
                {runningBatches.map(b => (
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
                        <Text style={styles.statLabel}>Input Bags</Text>
                        <Text style={styles.statVal}>{b.bags} Bags</Text>
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
            <Text style={styles.pickerSheetTitle}>Select Dryer Stop Time</Text>

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
