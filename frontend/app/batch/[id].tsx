import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import { Button } from "@/src/components/Button";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { StatusPill } from "@/src/components/ui";
import { storage } from "@/src/utils/storage";
import Loader from "@/src/components/Loader";

const FLOW = ["Received", "Loaded", "Drying", "Completed", "Delivered"];

export default function BatchDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [machines, setMachines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newWeight, setNewWeight] = useState("");
  const [newRate, setNewRate] = useState("");
  const [newBags, setNewBags] = useState("");
  const [newReceivedFrom, setNewReceivedFrom] = useState("");
  const [newRemarks, setNewRemarks] = useState("");
  const [newMachineId, setNewMachineId] = useState("");
  const [newStatus, setNewStatus] = useState("");

  const [compDryWeight, setCompDryWeight] = useState("");
  const [compPadiWeight, setCompPadiWeight] = useState("");
  const [compBags, setCompBags] = useState("");

  const openCompleteModal = () => {
    setCompDryWeight(data?.actual_dry_weight ? String(data.actual_dry_weight) : "");
    setCompPadiWeight(data?.padi_weight ? String(data.padi_weight) : "");
    setCompBags(data?.processed_bags ? String(data.processed_bags) : (data?.bags ? String(data.bags) : ""));
    setCompleteOpen(true);
  };

  const handleCompleteSubmit = async () => {
    const dry = parseFloat(compDryWeight);
    if (!dry || dry <= 0) {
      return toast.show("Please enter a valid dry weight", "error");
    }
    const padi = parseFloat(compPadiWeight || "0");
    const bagsNum = parseInt(compBags || "0", 10);
    setUpdating(true);
    try {
      await api(`/batches/${id}/status`, {
        method: "PUT",
        body: {
          status: "Completed",
          actual_dry_weight: dry,
          padi_weight: isNaN(padi) ? 0 : padi,
          processed_bags: isNaN(bagsNum) ? 0 : bagsNum,
        },
      });
      // Invalidate arrivals dashboard cache
      await storage.removeItem("cached_arrivals_dashboard");
      toast.show("Processing completed & customer notified!");
      setCompleteOpen(false);
      setLoading(true);
      await load();
    } catch (e: any) {
      toast.show(e.message || "Failed to complete processing", "error");
    } finally {
      setUpdating(false);
      setLoading(false);
    }
  };

  const openEditModal = () => {
    if (data) {
      setNewDate(data.arrival_date ? data.arrival_date.slice(0, 10) : "");
      setNewWeight(data.raw_weight != null ? String(data.raw_weight) : "");
      setNewRate(data.rate_per_kg != null ? String(data.rate_per_kg) : "10");
      setNewBags(data.bags != null ? String(data.bags) : "1");
      setNewReceivedFrom(data.received_from || "");
      setNewRemarks(data.remarks || "");
      setNewMachineId(data.machine_id || "");
      setNewStatus(data.status || "Received");
    }
    setEditOpen(true);
  };

  React.useEffect(() => {
    if (data?.arrival_date) {
      setNewDate(data.arrival_date.slice(0, 10));
    }
  }, [data]);

  const load = useCallback(async () => {
    if (!id || id === "[id]") return;
    try {
      const [d, mList] = await Promise.all([
        api<any>(`/batches/${id}`),
        api<any[]>(`/machines`).catch(() => []),
      ]);
      setData(d);
      setMachines(mList || []);
    } catch (e: any) {
      toast.show(e.message || "Failed to load batch detail", "error");
    } finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleDelete = async () => {
    try {
      await api(`/batches/${id}`, { method: "DELETE" });
      toast.show("Batch deleted successfully");
      router.back();
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  };

  const confirmDelete = () => {
    if (Platform.OS === "web") {
      const confirmed = window.confirm("Are you sure you want to delete this batch? All payments and history will be permanently deleted.");
      if (confirmed) {
        handleDelete();
      }
    } else {
      Alert.alert(
        "Delete Batch",
        "Are you sure you want to delete this batch? All payments and history will be permanently deleted.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: handleDelete }
        ]
      );
    }
  };

  const handleSave = async () => {
    const reg = /^\d{4}-\d{2}-\d{2}$/;
    if (!reg.test(newDate)) {
      toast.show("Arrival date format must be YYYY-MM-DD", "error");
      return;
    }
    const weightNum = parseFloat(newWeight);
    if (!newWeight || isNaN(weightNum) || weightNum <= 0) {
      toast.show("Please enter a valid raw weight (KG)", "error");
      return;
    }
    const rateNum = parseFloat(newRate);
    if (!newRate || isNaN(rateNum) || rateNum <= 0) {
      toast.show("Please enter a valid rate per KG", "error");
      return;
    }

    setUpdating(true);
    try {
      await api(`/batches/${id}`, {
        method: "PUT",
        body: {
          arrival_date: newDate,
          raw_weight: weightNum,
          rate_per_kg: rateNum,
          bags: newBags ? parseInt(newBags, 10) : 1,
          received_from: newReceivedFrom,
          remarks: newRemarks,
          machine_id: newMachineId || null,
          status: newStatus || undefined,
        }
      });
      toast.show("Arrival & dryer details updated successfully");
      setEditOpen(false);
      await load();
    } catch (e: any) {
      toast.show(e.message || "Failed to update arrival", "error");
    } finally {
      setUpdating(false);
    }
  };

  const advance = async () => {
    if (!data) return;
    const idx = FLOW.indexOf(data.status);
    if (idx < 0 || idx >= FLOW.length - 1) return;
    const next = FLOW[idx + 1];
    if (next === "Completed") {
      openCompleteModal();
      return;
    }
    if (next === "Delivered") {
      router.push(`/delivery/${id}`);
      return;
    }
    setUpdating(true);
    try {
      await api(`/batches/${id}/status`, { method: "PUT", body: { status: next } });
      toast.show(`Batch marked ${next}`);
      await load();
    } catch (e: any) { toast.show(e.message, "error"); }
    finally { setUpdating(false); }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: "center", alignItems: "center" }]}>
        <Loader size={76} />
        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.text, marginTop: 12 }}>
          Loading Batch Details...
        </Text>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Batch details not found.</Text>
          <TouchableOpacity style={styles.errorBtn} onPress={() => router.back()}>
            <Text style={styles.errorBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const currentIdx = FLOW.indexOf(data.status);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="batch-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>Batch {data.batch_no}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={openEditModal} testID="batch-edit" style={styles.headerEditBtn}>
            <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.primary} />
            <Text style={styles.headerEditText}>Edit</Text>
          </TouchableOpacity>
          {user?.role === "Admin" && (
            <TouchableOpacity onPress={confirmDelete} testID="batch-delete">
              <MaterialCommunityIcons name="trash-can-outline" size={22} color={colors.danger} />
            </TouchableOpacity>
          )}
          <StatusPill status={data.status} />
        </View>
      </View>

      {/* Edit Arrival Modal */}
      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md }}>
              <Text style={styles.modalTitle}>Edit Arrival Item</Text>
              <TouchableOpacity onPress={() => setEditOpen(false)}>
                <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
              <Text style={styles.modalLabel}>Arrival Date (YYYY-MM-DD)</Text>
              <TextInput
                testID="batch-new-date-input"
                style={styles.modalInput}
                value={newDate}
                onChangeText={setNewDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textLight}
              />

              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>Raw Weight (KG)</Text>
                  <TextInput
                    testID="batch-new-weight-input"
                    style={styles.modalInput}
                    value={newWeight}
                    onChangeText={setNewWeight}
                    keyboardType="numeric"
                    placeholder="e.g. 120"
                    placeholderTextColor={colors.textLight}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>Rate / KG (₹)</Text>
                  <TextInput
                    testID="batch-new-rate-input"
                    style={styles.modalInput}
                    value={newRate}
                    onChangeText={setNewRate}
                    keyboardType="numeric"
                    placeholder="e.g. 10"
                    placeholderTextColor={colors.textLight}
                  />
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>Bags Count</Text>
                  <TextInput
                    testID="batch-new-bags-input"
                    style={styles.modalInput}
                    value={newBags}
                    onChangeText={setNewBags}
                    keyboardType="numeric"
                    placeholder="e.g. 1"
                    placeholderTextColor={colors.textLight}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>Est. Bill Amount</Text>
                  <View style={[styles.modalInput, { justifyContent: "center", backgroundColor: `${colors.primary}0D` }]}>
                    <Text style={{ fontWeight: "700", color: colors.primary }}>
                      ₹{((parseFloat(newWeight) || 0) * (parseFloat(newRate) || 0)).toLocaleString("en-IN")}
                    </Text>
                  </View>
                </View>
              </View>

              <Text style={styles.modalLabel}>Received From</Text>
              <TextInput
                testID="batch-new-received-from-input"
                style={styles.modalInput}
                value={newReceivedFrom}
                onChangeText={setNewReceivedFrom}
                placeholder="Driver / Agent Name"
                placeholderTextColor={colors.textLight}
              />

              <Text style={styles.modalLabel}>Remarks</Text>
              <TextInput
                testID="batch-new-remarks-input"
                style={[styles.modalInput, { height: 60 }]}
                value={newRemarks}
                onChangeText={setNewRemarks}
                multiline
                placeholder="Optional notes..."
                placeholderTextColor={colors.textLight}
              />

              <Text style={styles.modalLabel}>Assigned Dryer Machine</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: spacing.md }}>
                <TouchableOpacity
                  onPress={() => setNewMachineId("")}
                  style={[styles.pillOption, !newMachineId && styles.pillOptionActive]}
                >
                  <Text style={[styles.pillOptionText, !newMachineId && styles.pillOptionTextActive]}>
                    Unassigned (Floor)
                  </Text>
                </TouchableOpacity>
                {machines.map(m => (
                  <TouchableOpacity
                    key={m.id}
                    onPress={() => {
                      setNewMachineId(m.id);
                      if (newStatus === "Received") setNewStatus("Drying");
                    }}
                    style={[styles.pillOption, newMachineId === m.id && styles.pillOptionActive]}
                  >
                    <Text style={[styles.pillOptionText, newMachineId === m.id && styles.pillOptionTextActive]}>
                      {m.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.modalLabel}>Processing Status</Text>
              <View style={{ flexDirection: "row", gap: 6, marginBottom: spacing.md, flexWrap: "wrap" }}>
                {["Received", "Drying", "Completed", "Delivered"].map(st => (
                  <TouchableOpacity
                    key={st}
                    onPress={() => setNewStatus(st)}
                    style={[styles.pillOption, newStatus === st && styles.pillOptionActive]}
                  >
                    <Text style={[styles.pillOptionText, newStatus === st && styles.pillOptionTextActive]}>
                      {st}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={[styles.modalButtons, { marginTop: spacing.md }]}>
              <TouchableOpacity
                testID="batch-edit-cancel"
                style={[styles.modalBtn, { borderColor: colors.border, borderWidth: 1 }]}
                onPress={() => setEditOpen(false)}
              >
                <Text style={{ color: colors.textMuted, fontWeight: "700" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="batch-edit-submit"
                style={[styles.modalBtn, { backgroundColor: colors.primary }]}
                onPress={handleSave}
                disabled={updating}
              >
                {updating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "800" }}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Complete Processing Modal */}
      <Modal visible={completeOpen} transparent animationType="fade" onRequestClose={() => setCompleteOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md }}>
              <View>
                <Text style={styles.modalTitle}>Complete Processing</Text>
                <Text style={{ fontSize: 12, color: colors.textMuted }}>
                  {data?.batch_no} • {data?.customer?.name}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setCompleteOpen(false)}>
                <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Arrival Reference Info */}
            <View style={styles.completeRefBox}>
              <View style={{ flex: 1 }}>
                <Text style={styles.completeRefLabel}>ARRIVAL WET WEIGHT</Text>
                <Text style={styles.completeRefVal}>{data?.raw_weight || 0} kg</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.completeRefLabel}>ARRIVAL BAGS</Text>
                <Text style={styles.completeRefVal}>{data?.bags || 0} Bags</Text>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
              <Text style={styles.modalLabel}>Processed Dry Weight (KG) *</Text>
              <TextInput
                testID="complete-dry-weight"
                style={styles.modalInput}
                value={compDryWeight}
                onChangeText={setCompDryWeight}
                keyboardType="decimal-pad"
                placeholder="e.g. 112.5"
                placeholderTextColor={colors.textLight}
              />

              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>Padi Weight (KG)</Text>
                  <TextInput
                    testID="complete-padi-weight"
                    style={styles.modalInput}
                    value={compPadiWeight}
                    onChangeText={setCompPadiWeight}
                    keyboardType="decimal-pad"
                    placeholder="e.g. 5.2"
                    placeholderTextColor={colors.textLight}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>Dry Bags</Text>
                  <TextInput
                    testID="complete-bags"
                    style={styles.modalInput}
                    value={compBags}
                    onChangeText={setCompBags}
                    keyboardType="number-pad"
                    placeholder="e.g. 2"
                    placeholderTextColor={colors.textLight}
                  />
                </View>
              </View>

              {/* Live Calculation Preview */}
              {parseFloat(compDryWeight || "0") > 0 && (
                <View style={styles.completeCalcBox}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                    <Text style={styles.completeCalcLabel}>Total Output (Dry + Padi):</Text>
                    <Text style={styles.completeCalcVal}>
                      {(parseFloat(compDryWeight || "0") + parseFloat(compPadiWeight || "0")).toFixed(2)} kg
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={styles.completeCalcLabel}>Weight Loss (Moisture):</Text>
                    <Text style={[styles.completeCalcVal, { color: colors.warning }]}>
                      {Math.max(0, (data?.raw_weight || 0) - (parseFloat(compDryWeight || "0") + parseFloat(compPadiWeight || "0"))).toFixed(2)} kg
                      {" "}({(((data?.raw_weight || 0) - (parseFloat(compDryWeight || "0") + parseFloat(compPadiWeight || "0"))) / (data?.raw_weight || 1) * 100).toFixed(1)}%)
                    </Text>
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={[styles.modalButtons, { marginTop: spacing.md }]}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: colors.border, borderWidth: 1 }]}
                onPress={() => setCompleteOpen(false)}
              >
                <Text style={{ color: colors.textMuted, fontWeight: "700" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.primary }]}
                onPress={handleCompleteSubmit}
                disabled={updating}
              >
                {updating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>Complete & Notify</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* View QR Code Modal */}
      <Modal visible={qrModalOpen} transparent animationType="fade" onRequestClose={() => setQrModalOpen(false)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalContent, { alignItems: "center", paddingVertical: 24 }]}>
            <View style={styles.qrModalHeader}>
              <Text style={styles.qrModalTitle}>Batch QR Tag</Text>
              <TouchableOpacity onPress={() => setQrModalOpen(false)}>
                <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.qrBox}>
              <QRCode value={data.qr_code || data.id} size={180} color={colors.text} backgroundColor="#fff" />
            </View>

            <Text style={styles.batchNo}>{data.batch_no}</Text>
            <Text style={styles.receipt}>Receipt: {data.receipt_no}</Text>

            <TouchableOpacity
              style={styles.qrCloseBtn}
              onPress={() => setQrModalOpen(false)}
            >
              <Text style={styles.qrCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Compact Batch Header with View QR Code Button */}
        <View style={styles.compactHero}>
          <View style={{ flex: 1 }}>
            <Text style={styles.batchNoLarge}>{data.batch_no}</Text>
            <Text style={styles.receiptSmall}>Receipt: {data.receipt_no}</Text>
          </View>

          <TouchableOpacity
            style={styles.qrPillBtn}
            onPress={() => setQrModalOpen(true)}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="qrcode-scan" size={16} color={colors.primary} />
            <Text style={styles.qrPillBtnText}>View QR Code</Text>
          </TouchableOpacity>
        </View>

        {/* Multi-Dryer Split Batches */}
        {data.sibling_batches && data.sibling_batches.length > 1 && (
          <View style={styles.siblingCard}>
            <View style={styles.siblingHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <MaterialCommunityIcons name="call-split" size={18} color={colors.primary} />
                <Text style={styles.siblingTitle}>Multi-Dryer Split Arrival</Text>
              </View>
              <Text style={styles.siblingTotalWeight}>Arrival Total: {data.total_arrival_weight} KG</Text>
            </View>
            <Text style={styles.siblingSubtitle}>
              This arrival is split across {data.sibling_batches.length} dryer loads. Tap any lot to view or edit:
            </Text>
            <View style={styles.siblingList}>
              {data.sibling_batches.map((sb: any) => {
                const isCurrent = sb.id === data.id;
                return (
                  <TouchableOpacity
                    key={sb.id}
                    disabled={isCurrent}
                    onPress={() => router.push(`/batch/${sb.id}`)}
                    style={[styles.siblingItem, isCurrent && styles.siblingItemActive]}
                    activeOpacity={0.8}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={[styles.siblingBatchNo, isCurrent && { color: colors.primary }]}>{sb.batch_no}</Text>
                        {isCurrent && (
                          <View style={styles.currentBadge}>
                            <Text style={styles.currentBadgeText}>THIS LOT</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.siblingMeta}>
                        {sb.machine_name || "Unassigned"} • {sb.status}
                      </Text>
                    </View>
                    <Text style={[styles.siblingWeight, isCurrent && { color: colors.primary }]}>
                      {sb.raw_weight} kg
                    </Text>
                    {!isCurrent && (
                      <MaterialCommunityIcons name="chevron-right" size={16} color={colors.textLight} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

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
          <Row
            label="Customer"
            value={data.customer?.name || "-"}
            sub={data.customer?.mobile}
            onPress={() => (data.customer_id || data.customer?.id) ? router.push(`/customer/${data.customer_id || data.customer?.id}`) : undefined}
          />
          {data.received_from && data.received_from !== data.customer?.name ? (
            <Row label="Received From" value={data.received_from} />
          ) : null}
          <Row label="Product" value={data.product?.name || "-"} />
          <Row label="Machine" value={data.machine?.name || "-"} />
          <Row label="Raw Weight" value={`${data.raw_weight} kg`} />
          {data.actual_dry_weight ? (
            <>
              <Row label="Actual Dry Weight" value={`${data.actual_dry_weight} kg`} />
              {data.padi_weight != null && Number(data.padi_weight) > 0 ? (
                <Row label="Padi Weight" value={`${data.padi_weight} kg`} />
              ) : null}
              <Row
                label="Weight Loss"
                value={`${data.weight_loss != null ? data.weight_loss : Math.max(0, data.raw_weight - (Number(data.actual_dry_weight) + Number(data.padi_weight || 0)))} kg (${data.raw_weight > 0 ? (((data.raw_weight - (Number(data.actual_dry_weight) + Number(data.padi_weight || 0))) / data.raw_weight) * 100).toFixed(1) : "0"}%)`}
              />
            </>
          ) : null}
          {data.moisture && data.moisture > 0 ? (
            <Row label="Moisture" value={`${data.moisture}%`} />
          ) : null}
          <Row
            label="Bags"
            value={
              data.bags
                ? data.bag_weight && data.bag_weight > 0
                  ? `${data.bags} Bags (${data.bag_weight} kg/bag)`
                  : `${data.bags} Bags`
                : "-"
            }
          />
          {data.processed_bags != null && Number(data.processed_bags) > 0 ? (
            <Row label="Processed Dry Bags" value={`${data.processed_bags} Bags`} />
          ) : null}
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

function Row({ label, value, sub, bold, accent, onPress }: { label: string; value: string; sub?: string; bold?: boolean; accent?: boolean; onPress?: () => void }) {
  const content = (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={[styles.rowValue, bold && { fontWeight: "800", fontSize: 15 }, accent && { color: colors.accent }, onPress && { color: colors.primary, textDecorationLine: "underline" }]}>{value}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
    </View>
  );
  if (onPress) {
    return <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{content}</TouchableOpacity>;
  }
  return content;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md, gap: spacing.md },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headerEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: `${colors.primary}18`,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  headerEditText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
  },
  title: { flex: 1, fontSize: 18, fontWeight: "800", color: colors.text, textAlign: "center" },
  compactHero: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    backgroundColor: colors.card,
    marginHorizontal: spacing.xl,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    borderRadius: radius.xl,
    ...shadow.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  batchNoLarge: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.2,
  },
  receiptSmall: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  qrPillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: `${colors.primary}12`,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: `${colors.primary}30`,
  },
  qrPillBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  qrModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: spacing.lg,
  },
  qrModalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  qrCloseBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  qrCloseBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  hero: { alignItems: "center", padding: spacing.xl, gap: 4 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: spacing.xl },
  modalContent: { backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.xl, width: "100%", ...shadow.card },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.text, marginBottom: spacing.md },
  completeRefBox: {
    flexDirection: "row",
    backgroundColor: `${colors.primary}12`,
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: `${colors.primary}25`,
    marginBottom: spacing.md,
  },
  completeRefLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.primaryDark,
    letterSpacing: 0.5,
  },
  completeRefVal: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
    marginTop: 2,
  },
  completeCalcBox: {
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: spacing.md,
  },
  completeCalcLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  completeCalcVal: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
  },
  modalLabel: { fontSize: 11, fontWeight: "800", color: colors.textMuted, marginBottom: 6, letterSpacing: 0.3, textTransform: "uppercase" },
  modalInput: { backgroundColor: colors.bg, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.text, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg },
  modalButtons: { flexDirection: "row", gap: spacing.md },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
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
  errorContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.xl, gap: spacing.md },
  errorText: { fontSize: 16, color: colors.textMuted, textAlign: "center", fontWeight: "600" },
  errorBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.primary, borderRadius: radius.pill },
  errorBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  siblingCard: {
    marginHorizontal: spacing.xl,
    backgroundColor: "#F0FDF4",
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    ...shadow.sm,
  },
  siblingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  siblingTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#166534",
  },
  siblingTotalWeight: {
    fontSize: 13,
    fontWeight: "900",
    color: "#166534",
  },
  siblingSubtitle: {
    fontSize: 11,
    color: "#15803D",
    marginBottom: spacing.sm,
  },
  siblingList: {
    gap: 6,
  },
  siblingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#DCFCE7",
  },
  siblingItemActive: {
    backgroundColor: "#DCFCE7",
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  siblingBatchNo: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
  },
  currentBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  currentBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#fff",
  },
  siblingMeta: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  siblingWeight: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
    marginRight: 4,
  },
  pillOption: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillOptionActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillOptionText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  pillOptionTextActive: {
    color: "#fff",
  },
});
