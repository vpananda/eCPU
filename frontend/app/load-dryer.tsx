import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import Calendar from "@/src/components/Calendar";
import { colors, radius, shadow, spacing } from "@/src/theme";

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

export default function LoadDryer() {
  const router = useRouter();
  const { machineId, machineName } = useLocalSearchParams<{ machineId: string; machineName: string }>();
  const { selectedBranchId } = useAuth();
  
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  // Date and Time picker states
  const [processTime, setProcessTime] = useState(new Date());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [tempDateStr, setTempDateStr] = useState(todayISOStr(new Date()));
  const [tempHour, setTempHour] = useState(12);
  const [tempMinute, setTempMinute] = useState(0);
  const [tempAmPm, setTempAmPm] = useState<"AM" | "PM">("AM");

  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      const url = selectedBranchId 
        ? `/batches?status=Received&branch_id=${selectedBranchId}` 
        : "/batches?status=Received";
      const all = await api<Batch[]>(url);
      setBatches(all);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to load received stock");
    } finally {
      setLoading(false);
    }
  }, [selectedBranchId]);

  useFocusEffect(
    useCallback(() => {
      loadBatches();
    }, [loadBatches])
  );

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => ({
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

  const handleLoad = async () => {
    const ids = Object.keys(selectedIds).filter(id => selectedIds[id]);
    if (ids.length === 0) {
      Alert.alert("Selection Required", "Please select at least one customer stock to load.");
      return;
    }

    setSaving(true);
    try {
      await api(`/machines/${machineId}/load`, {
        method: "POST",
        body: { batch_ids: ids, start_time: processTime.toISOString() }
      });
      Alert.alert("Success", "Dryer loaded and drying run started successfully.");
      router.back();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to load dryer");
    } finally {
      setSaving(false);
    }
  };

  const totalRawWeight = batches
    .filter(b => selectedIds[b.id])
    .reduce((sum, b) => sum + (b.raw_weight || 0), 0);

  const totalBags = batches
    .filter(b => selectedIds[b.id])
    .reduce((sum, b) => sum + (b.bags || 0), 0);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {/* Custom Navigation Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Load Machine</Text>
          <Text style={styles.headerSub}>{machineName || "Dryer"}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Fetching available stock...</Text>
        </View>
      ) : batches.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIconBox}>
            <MaterialCommunityIcons name="package-variant" size={48} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No Stocks Available</Text>
          <Text style={styles.emptyDesc}>
            All arrivals at this branch are currently processed or loaded. Add a new arrival to start.
          </Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            
            {/* DATE TIME SELECTOR */}
            <Text style={styles.sectionTitle}>1. Select Process Start Time</Text>
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

            {/* ARRIVALS SELECTOR */}
            <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>2. Select Arrivals ({batches.length} available)</Text>
            {batches.map(b => {
              const isSelected = !!selectedIds[b.id];
              return (
                <TouchableOpacity
                  key={b.id}
                  style={[styles.card, isSelected && styles.cardSelected]}
                  onPress={() => toggleSelect(b.id)}
                  activeOpacity={0.9}
                >
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.custName}>{b.customer?.name || "Unknown Customer"}</Text>
                      <Text style={styles.batchSub}>{b.batch_no} • {b.product?.name || "N/A"}</Text>
                    </View>
                    <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                      {isSelected && <MaterialCommunityIcons name="check" size={16} color="#fff" />}
                    </View>
                  </View>
                  <View style={styles.cardDivider} />
                  <View style={styles.cardStats}>
                    <Text style={styles.statLabel}>Raw Weight: <Text style={styles.statVal}>{b.raw_weight} KG</Text></Text>
                    <Text style={styles.statLabel}>Input Bags: <Text style={styles.statVal}>{b.bags} Bags</Text></Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Action Bar */}
          <View style={styles.buttonBar}>
            <View style={styles.summaryInfo}>
              <Text style={styles.summaryLabel}>Total Selected</Text>
              <Text style={styles.summaryVal}>{totalRawWeight.toFixed(2)} KG ({totalBags} Bags)</Text>
            </View>
            <TouchableOpacity
              style={[styles.loadBtn, (saving || Object.keys(selectedIds).filter(k=>selectedIds[k]).length === 0) && styles.loadBtnDisabled]}
              onPress={handleLoad}
              disabled={saving || Object.keys(selectedIds).filter(k=>selectedIds[k]).length === 0}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <MaterialCommunityIcons name="play-circle" size={20} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.loadBtnText}>Start Drying Process</Text>
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
  headerTitleContainer: { alignItems: "center" },
  headerTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  headerSub: { fontSize: 13, color: colors.textMuted, marginTop: 1, fontWeight: "500" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  loadingText: { marginTop: spacing.md, color: colors.textMuted, fontSize: 14, fontWeight: "600" },
  emptyIconBox: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#f5f5f5", alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: colors.text, marginBottom: 6 },
  emptyDesc: { fontSize: 13, color: colors.textMuted, textAlign: "center", lineHeight: 18, paddingHorizontal: spacing.md },
  scroll: { padding: spacing.lg, paddingBottom: 120 },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: spacing.md },
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
  card: {
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}05`,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  custName: { fontSize: 14, fontWeight: "800", color: colors.text },
  batchSub: { fontSize: 11, color: colors.textMuted, marginTop: 2, fontWeight: "500" },
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
  cardDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  cardStats: { flexDirection: "row", gap: spacing.md },
  statLabel: { fontSize: 12, color: colors.textMuted, fontWeight: "500" },
  statVal: { fontWeight: "700", color: colors.text },
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
  loadBtn: {
    flex: 1.2,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  loadBtnDisabled: { opacity: 0.6 },
  loadBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },

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
