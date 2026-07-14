import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import { Input } from "@/src/components/Input";
import { Button } from "@/src/components/Button";
import { Picker } from "@/src/components/Picker";
import { colors, spacing } from "@/src/theme";

const STATUS_OPTIONS = [
  { id: "Available", name: "Available" },
  { id: "Running", name: "Running" },
  { id: "Maintenance", name: "Maintenance" },
  { id: "Cleaning", name: "Cleaning" },
];

export default function MachineForm() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isEdit = !!id;
  const toast = useToast();
  const { user } = useAuth();

  const [form, setForm] = useState({
    name: "",
    capacity: "",
    status: "Available",
    branch_id: "",
  });
  const [branches, setBranches] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const list = await api<any[]>("/branches");
        setBranches(list);
        
        if (isEdit) {
          const machines = await api<any[]>("/machines");
          const m = machines.find(item => item.id === id);
          if (m) {
            setForm({
              name: m.name,
              capacity: m.capacity != null ? String(m.capacity) : "",
              status: m.status,
              branch_id: m.branch_id || "",
            });
          }
        } else if (user) {
          if (user.role === "Admin") {
            setForm(f => ({ ...f, branch_id: user.branch_id || list[0]?.id || "" }));
          } else {
            setForm(f => ({ ...f, branch_id: user.branch_id || "" }));
          }
        }
      } catch (e) {
        console.error("Failed to initialize form", e);
      }
    })();
  }, [id, isEdit, user]);

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name || !form.capacity) {
      toast.show("Name and capacity are required", "error");
      return;
    }
    const cap = parseFloat(form.capacity);
    if (isNaN(cap) || cap <= 0) {
      toast.show("Capacity must be a positive number", "error");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name,
        capacity: cap,
        status: form.status,
        branch_id: form.branch_id || null,
      };

      if (isEdit) {
        await api(`/machines/${id}`, { method: "PUT", body: payload });
        toast.show("Machine updated successfully");
      } else {
        await api("/machines", { method: "POST", body: payload });
        toast.show("Machine created successfully");
      }
      router.back();
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="machine-form-close">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{isEdit ? "Edit Machine" : "New Machine"}</Text>
        <View style={{ width: 22 }} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl }} keyboardShouldPersistTaps="handled">
          <Input testID="mf-name" label="Name *" value={form.name} onChangeText={v => set("name", v)} placeholder="Dryer Name" />
          <Input testID="mf-capacity" label="Capacity (kg) *" value={form.capacity} onChangeText={v => set("capacity", v)} keyboardType="numeric" placeholder="Capacity in kg" />
          
          <Picker
            testID="mf-status"
            label="Status *"
            value={form.status}
            onChange={v => set("status", v)}
            options={STATUS_OPTIONS}
            placeholder="Select status..."
          />

          {user?.role === "Admin" ? (
            <Picker
              testID="mf-branch"
              label="Branch *"
              value={form.branch_id}
              onChange={v => set("branch_id", v)}
              options={branches.map(b => ({ id: b.id, name: b.name }))}
              placeholder="Select branch..."
            />
          ) : (
            <Input
              testID="mf-branch-readonly"
              label="Branch"
              value={branches.find(b => b.id === form.branch_id)?.name || "—"}
              editable={false}
            />
          )}

          <View style={{ height: spacing.md }} />
          <Button testID="mf-save" title={isEdit ? "Update Machine" : "Save Machine"} onPress={save} loading={saving} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
});
