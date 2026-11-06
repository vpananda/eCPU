import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
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
  const { id, outsourced } = useLocalSearchParams<{ id: string; outsourced?: string }>();
  const isEdit = !!id;
  const toast = useToast();
  const { user, branches } = useAuth();

  const [form, setForm] = useState({
    name: "",
    capacity: "",
    status: "Available",
    branch_id: "",
    is_outsourced: outsourced === "1",
    vendor_name: "",
    vendor_phone: "",
    vendor_rate_per_kg: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (isEdit) {
          const m = await api<any>(`/machines/${id}`);
          if (m) {
            setForm({
              name: m.name || "",
              capacity: m.capacity != null ? String(m.capacity) : "",
              status: m.status || "Available",
              branch_id: m.branch_id || "",
              is_outsourced: Boolean(m.is_outsourced),
              vendor_name: m.vendor_name || "",
              vendor_phone: m.vendor_phone || "",
              vendor_rate_per_kg: m.vendor_rate_per_kg != null ? String(m.vendor_rate_per_kg) : "",
            });
          }
        } else if (user) {
          if (user.role === "Admin") {
            setForm(f => ({ ...f, branch_id: f.branch_id || user.branch_id || branches[0]?.id || "" }));
          } else {
            setForm(f => ({ ...f, branch_id: user.branch_id || "" }));
          }
        }
      } catch (e) {
        console.error("Failed to initialize form", e);
      }
    })();
  }, [id, isEdit, user, branches]);

  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }));

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

    if (form.is_outsourced && !(form.vendor_name || "").trim()) {
      toast.show("Please enter the vendor/dryer name for outsourced machine", "error");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        capacity: cap,
        status: form.status,
        branch_id: form.branch_id || null,
        is_outsourced: Boolean(form.is_outsourced),
        vendor_name: form.is_outsourced ? (form.vendor_name || "").trim() : "",
        vendor_phone: form.is_outsourced ? (form.vendor_phone || "").trim() : "",
        vendor_rate_per_kg: form.is_outsourced && form.vendor_rate_per_kg ? parseFloat(form.vendor_rate_per_kg) : 0,
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
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="machine-form-close">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{isEdit ? "Edit Machine" : "New Machine"}</Text>
        <View style={{ width: 22 }} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl }} keyboardShouldPersistTaps="handled">
          {/* Machine Source Type Selector */}
          <Text style={styles.fieldLabel}>Machine Classification *</Text>
          <View style={styles.typeSelectorRow}>
            <TouchableOpacity
              style={[styles.typeOptionBtn, !form.is_outsourced && styles.typeOptionBtnActive]}
              onPress={() => set("is_outsourced", false)}
            >
              <MaterialCommunityIcons
                name="factory"
                size={20}
                color={!form.is_outsourced ? "#fff" : colors.textMuted}
              />
              <Text style={[styles.typeOptionText, !form.is_outsourced && styles.typeOptionTextActive]}>
                In-House Machine
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.typeOptionBtn, form.is_outsourced && styles.typeOptionBtnOutsourcedActive]}
              onPress={() => set("is_outsourced", true)}
            >
              <MaterialCommunityIcons
                name="truck-delivery-outline"
                size={20}
                color={form.is_outsourced ? "#fff" : colors.textMuted}
              />
              <Text style={[styles.typeOptionText, form.is_outsourced && styles.typeOptionTextActive]}>
                Outsourced Dryer
              </Text>
            </TouchableOpacity>
          </View>

          {/* Conditional Vendor Fields for Outsourced Machines */}
          {form.is_outsourced && (
            <View style={styles.vendorBox}>
              <View style={styles.vendorHeader}>
                <MaterialCommunityIcons name="information" size={16} color="#E65100" />
                <Text style={styles.vendorHeaderText}>Outsourcing Vendor Details</Text>
              </View>
              <Input
                testID="mf-vendor-name"
                label="Vendor / Dryer Name *"
                value={form.vendor_name}
                onChangeText={v => set("vendor_name", v)}
                placeholder="e.g. KM Dryers Moolathurai"
              />
              <Input
                testID="mf-vendor-phone"
                label="Vendor Phone Number"
                value={form.vendor_phone}
                onChangeText={v => set("vendor_phone", v)}
                keyboardType="phone-pad"
                placeholder="e.g. 9876543210"
              />
              <Input
                testID="mf-vendor-rate"
                label="Vendor Job-Work Cost / KG (₹)"
                value={form.vendor_rate_per_kg}
                onChangeText={v => set("vendor_rate_per_kg", v)}
                keyboardType="numeric"
                placeholder="e.g. 10.00"
              />
            </View>
          )}

          <Input testID="mf-name" label="Machine Name *" value={form.name} onChangeText={v => set("name", v)} placeholder={form.is_outsourced ? "e.g. EXT - KM Dryer 1" : "e.g. Dryer #1"} />
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
  fieldLabel: { fontSize: 13, fontWeight: "700", color: colors.textMuted, marginBottom: 8 },
  typeSelectorRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  typeOptionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
  },
  typeOptionBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeOptionBtnOutsourcedActive: {
    backgroundColor: "#E65100",
    borderColor: "#E65100",
  },
  typeOptionText: { fontSize: 13, fontWeight: "700", color: colors.textMuted },
  typeOptionTextActive: { color: "#FFFFFF" },
  vendorBox: {
    backgroundColor: "#FFF8E1",
    borderWidth: 1,
    borderColor: "#FFE082",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  vendorHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  vendorHeaderText: { fontSize: 13, fontWeight: "800", color: "#E65100" },
});
