import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Modal, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import { Input } from "@/src/components/Input";
import { Button } from "@/src/components/Button";
import { colors, radius, shadow, spacing } from "@/src/theme";

type Branch = { id: string; name: string; address?: string; phone?: string };

export default function BranchesAdmin() {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await api<Branch[]>("/branches")); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => { setEditing(null); setName(""); setAddress(""); setPhone(""); setOpen(true); };
  const openEdit = (b: Branch) => { setEditing(b); setName(b.name); setAddress(b.address || ""); setPhone(b.phone || ""); setOpen(true); };

  const confirmDelete = (b: Branch) => {
    if (Platform.OS === "web") {
      const confirmed = window.confirm(`Are you sure you want to delete branch "${b.name}"? This action cannot be undone.`);
      if (confirmed) {
        (async () => {
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
        })();
      }
    } else {
      Alert.alert(
        "Delete Branch",
        `Are you sure you want to delete branch "${b.name}"? This action cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
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
            }
          }
        ]
      );
    }
  };

  const save = async () => {
    if (!name.trim()) return toast.show("Branch name required", "error");
    setSaving(true);
    try {
      if (editing) {
        await api(`/branches/${editing.id}`, { method: "PUT", body: { name, address, phone } });
        toast.show("Branch updated");
      } else {
        await api("/branches", { method: "POST", body: { name, address, phone } });
        toast.show("Branch created");
      }
      setOpen(false);
      await load();
    } catch (e: any) { toast.show(e.message, "error"); }
    finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
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
            <Text style={styles.sheetTitle}>{editing ? "Edit Branch" : "New Branch"}</Text>
            <Input testID="branch-name" label="Branch Name *" value={name} onChangeText={setName} />
            <Input testID="branch-address" label="Address" value={address} onChangeText={setAddress} multiline />
            <Input testID="branch-phone" label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <Button testID="branch-save" title={editing ? "Save Changes" : "Create Branch"} onPress={save} loading={saving} />
            
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
  sheetTitle: { fontSize: 18, fontWeight: "800", color: colors.text, marginBottom: spacing.md },
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
});
