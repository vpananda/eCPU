import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Modal, TouchableOpacity, ActivityIndicator, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import { Input } from "@/src/components/Input";
import { Button } from "@/src/components/Button";
import { Picker } from "@/src/components/Picker";
import { colors, radius, shadow, spacing } from "@/src/theme";

type User = { id: string; name: string; mobile?: string; email?: string; role: string; branch_id?: string };
type Branch = { id: string; name: string };

const ROLES = ["Admin", "Manager", "Store Incharge"];

export default function UsersAdmin() {
  const router = useRouter();
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("Store Incharge");
  const [branchId, setBranchId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [u, b] = await Promise.all([api<User[]>("/auth/users"), api<Branch[]>("/branches")]);
      setUsers(u);
      setBranches(b);
    } catch (e: any) {
      toast.show(e.message || "Access denied", "error");
    } finally { setLoading(false); }
  }, [toast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => {
    setEditing(null);
    setName(""); setMobile(""); setPassword(""); setRole("Store Incharge");
    setBranchId(branches[0]?.id || null);
    setOpen(true);
  };
  const openEdit = (u: User) => {
    setEditing(u);
    setName(u.name); setMobile(u.mobile || ""); setPassword("");
    setRole(u.role); setBranchId(u.branch_id || null);
    setOpen(true);
  };

  const save = async () => {
    if (!name.trim()) return toast.show("Name required", "error");
    if (!editing && !mobile.trim()) return toast.show("Mobile required", "error");
    if (!editing && !password) return toast.show("Password required", "error");
    setSaving(true);
    try {
      if (editing) {
        await api(`/auth/users/${editing.id}`, {
          method: "PUT",
          body: { name, role, branch_id: branchId, password: password || undefined },
        });
        toast.show("User updated");
      } else {
        await api("/auth/users", {
          method: "POST",
          body: { name, mobile: mobile.trim(), password, role, branch_id: branchId },
        });
        toast.show("User created");
      }
      setOpen(false);
      await load();
    } catch (e: any) { toast.show(e.message || "Failed", "error"); }
    finally { setSaving(false); }
  };

  const remove = async (u: User) => {
    try {
      await api(`/auth/users/${u.id}`, { method: "DELETE" });
      toast.show("User removed");
      await load();
    } catch (e: any) { toast.show(e.message, "error"); }
  };

  const branchName = (id?: string) => branches.find(b => b.id === id)?.name || "—";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="users-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Users</Text>
        <TouchableOpacity testID="users-add" style={styles.addBtn} onPress={openNew}>
          <MaterialCommunityIcons name="plus" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.sm, paddingBottom: 80 }}>
          {users.map(u => (
            <TouchableOpacity key={u.id} testID={`user-${u.id}`} style={styles.item} onPress={() => openEdit(u)} activeOpacity={0.85}>
              <View style={[styles.avatar, { backgroundColor: u.role === "Admin" ? colors.primary : u.role === "Manager" ? colors.info + "22" : colors.accent + "22" }]}>
                <Text style={[styles.avatarText, { color: u.role === "Admin" ? "#fff" : u.role === "Manager" ? colors.info : colors.accent }]}>{u.name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{u.name}</Text>
                <Text style={styles.meta}>{u.mobile || u.email || "-"} · {branchName(u.branch_id)}</Text>
                <View style={styles.roleBadge}><Text style={styles.roleText}>{u.role}</Text></View>
              </View>
              <TouchableOpacity onPress={() => remove(u)} testID={`user-delete-${u.id}`} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.danger} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Modal */}
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetWrap}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{editing ? "Edit User" : "New User"}</Text>
            <ScrollView contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
              <Input testID="user-name" label="Name *" value={name} onChangeText={setName} />
              <Input testID="user-mobile" label={editing ? "Mobile" : "Mobile *"} value={mobile} onChangeText={setMobile} keyboardType="phone-pad" editable={!editing} maxLength={15} />
              <Input testID="user-password" label={editing ? "New Password (leave blank to keep)" : "Password *"} value={password} onChangeText={setPassword} secureTextEntry />
              <Text style={styles.label}>Role</Text>
              <View style={styles.chipRow}>
                {ROLES.map(r => (
                  <TouchableOpacity key={r} testID={`user-role-${r.toLowerCase().replace(/\s/g, "-")}`} style={[styles.chip, role === r && styles.chipActive]} onPress={() => setRole(r)}>
                    <Text style={[styles.chipText, role === r && { color: "#fff" }]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Picker
                testID="user-branch"
                label="Branch"
                value={branchId}
                onChange={setBranchId}
                options={branches.map(b => ({ id: b.id, name: b.name }))}
                placeholder="Select branch"
              />
              <Button testID="user-save" title={editing ? "Save Changes" : "Create User"} onPress={save} loading={saving} />
            </ScrollView>
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
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 17, fontWeight: "800" },
  name: { fontSize: 15, fontWeight: "800", color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  roleBadge: { alignSelf: "flex-start", marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: colors.primary50, borderRadius: radius.pill },
  roleText: { fontSize: 10, color: colors.primaryDark, fontWeight: "800" },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.5)" },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, padding: spacing.xl, maxHeight: "88%" },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: colors.text, marginBottom: spacing.md },
  label: { fontSize: 12, fontWeight: "700", color: colors.textMuted, marginBottom: 6, letterSpacing: 0.3, textTransform: "uppercase" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.text, fontWeight: "700" },
});
