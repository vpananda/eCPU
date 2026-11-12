import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Modal, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, Stack } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import { useConfirm } from "@/src/components/ConfirmModal";
import { Input } from "@/src/components/Input";
import { Button } from "@/src/components/Button";
import { MultiPhoneInput } from "@/src/components/MultiPhoneInput";
import { colors, radius, shadow, spacing } from "@/src/theme";

type Branch = { id: string; name: string; address?: string; phone?: string; report_phones?: string };

export default function BranchesAdmin() {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [reportPhones, setReportPhones] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await api<Branch[]>("/branches")); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => {
    setEditing(null);
    setName("");
    setAddress("");
    setPhone("");
    setReportPhones("");
    setOpen(true);
  };
  const openEdit = (b: Branch) => {
    setEditing(b);
    setName(b.name);
    setAddress(b.address || "");
    setPhone(b.phone || "");
    setReportPhones(b.report_phones || "");
    setOpen(true);
  };

  const confirmDelete = async (b: Branch) => {
    const ok = await confirm({
      title: "Delete Branch",
      message: `Are you sure you want to delete branch "${b.name}"? This action cannot be undone.`,
      confirmText: "Delete Branch",
      destructive: true,
      icon: "trash-can-outline",
    });
    if (!ok) return;

    setSaving(true);
    try {
      await api(`/branches/${b.id}`, { method: "DELETE" });
      toast.show("Branch deleted");
      setOpen(false);
      await load();
    } catch (err: any) {
      toast.show(err.message || "Failed to delete branch", "error");
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (!name.trim()) return toast.show("Branch name required", "error");
    setSaving(true);
    try {
      if (editing) {
        await api(`/branches/${editing.id}`, { method: "PUT", body: { name, address, phone, report_phones: reportPhones } });
        toast.show("Branch updated");
      } else {
        await api("/branches", { method: "POST", body: { name, address, phone, report_phones: reportPhones } });
        toast.show("Branch created");
      }
      setOpen(false);
      await load();
    } catch (e: any) { toast.show(e.message, "error"); }
    finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="branches-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Branches</Text>
        <TouchableOpacity testID="branches-add" style={styles.addBtn} onPress={openNew}>
          <MaterialCommunityIcons name="plus" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.sm, paddingBottom: 80 }}>
          {items.map(b => (
            <TouchableOpacity key={b.id} testID={`branch-${b.id}`} style={styles.item} onPress={() => openEdit(b)} activeOpacity={0.85}>
              <View style={styles.icon}><MaterialCommunityIcons name="office-building" size={22} color={colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{b.name}</Text>
                {b.address ? <Text style={styles.meta}>{b.address}</Text> : null}
                {b.phone ? <Text style={styles.meta}>{b.phone}</Text> : null}
                {b.report_phones ? (
                  <View style={styles.reportPill}>
                    <MaterialCommunityIcons name="whatsapp" size={13} color="#059669" />
                    <Text style={styles.reportPillText} numberOfLines={1}>Daily Report: {b.report_phones}</Text>
                  </View>
                ) : null}
              </View>
              <MaterialCommunityIcons name="pencil" size={18} color={colors.textLight} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetWrap}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{editing ? "Edit Branch" : "New Branch"}</Text>
              <TouchableOpacity
                onPress={() => setOpen(false)}
                style={styles.sheetCloseBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Close"
              >
                <MaterialCommunityIcons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Input testID="branch-name" label="Branch Name *" value={name} onChangeText={setName} />
            <Input testID="branch-address" label="Address" value={address} onChangeText={setAddress} multiline />
            <Input testID="branch-phone" label="Branch Office Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <MultiPhoneInput
              label="Branch Manager Numbers (This Branch)"
              helper="Add as many managers as needed. Every number here receives this branch's daily 9:00 PM summary."
              value={reportPhones}
              onChangeText={setReportPhones}
              placeholder="Enter manager mobile e.g. 9842100000"
            />
            <View style={{ marginTop: spacing.xs }} />
            <View style={styles.actionsRow}>
              <TouchableOpacity
                testID="branch-cancel"
                style={styles.cancelBtn}
                onPress={() => setOpen(false)}
                activeOpacity={0.7}
                disabled={saving}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <View style={{ flex: 1.6 }}>
                <Button testID="branch-save" title={editing ? "Save Changes" : "Create Branch"} onPress={save} loading={saving} />
              </View>
            </View>
            
            {editing && (
              <TouchableOpacity
                testID="branch-delete"
                style={styles.deleteBtn}
                onPress={() => confirmDelete(editing)}
              >
                <MaterialCommunityIcons name="delete" size={16} color={colors.danger} />
                <Text style={styles.deleteBtnText}>Delete Branch</Text>
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  addBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", ...shadow.fab },
  item: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, padding: spacing.md, borderRadius: radius.xl, gap: spacing.md, ...shadow.card },
  icon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary50, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 15, fontWeight: "800", color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.5)" },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, padding: spacing.xl, paddingBottom: spacing.xxl },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  sheetCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  actionsRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.xs },
  cancelBtn: { flex: 1, height: 48, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.card },
  cancelBtnText: { fontSize: 15, fontWeight: "700", color: colors.textMuted },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderColor: colors.danger,
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingVertical: 12,
    marginTop: spacing.md,
    gap: 6,
  },
  deleteBtnText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "700",
  },
  reportPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  reportPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#065F46",
  },
  inputHelper: {
    fontSize: 11.5,
    color: colors.textMuted,
    marginTop: -spacing.xs,
    marginBottom: spacing.md,
    lineHeight: 16,
  },
});
