import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, ActivityIndicator, Switch } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import { Input } from "@/src/components/Input";
import { Button } from "@/src/components/Button";
import { Picker } from "@/src/components/Picker";
import { storage } from "@/src/utils/storage";
import { colors, spacing } from "@/src/theme";

const LANGUAGE_OPTIONS = [
  { id: "en", name: "English" },
  { id: "ta", name: "Tamil (தமிழ்)" },
  { id: "ml", name: "Malayalam (മലയാളം)" },
  { id: "kn", name: "Kannada (ಕನ್ನಡ)" },
  { id: "te", name: "Telugu (తెలుగు)" },
  { id: "hi", name: "Hindi (हिन्दी)" },
];

export default function CustomerForm() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;
  const toast = useToast();
  const { user, branches } = useAuth();
  
  const [form, setForm] = useState({
    name: "",
    mobile: "",
    alt_mobile: "",
    village: "",
    taluk: "",
    district: "",
    address: "",
    gst: "",
    remarks: "",
    branch_id: "",
    preferred_language: "en",
    whatsapp_enabled: true,
  });
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    if (isEdit && id) {
      (async () => {
        try {
          const c = await api<any>(`/customers/${id}`);
          if (c && active) {
            setForm({
              name: c.name || "",
              mobile: c.mobile || "",
              alt_mobile: c.alt_mobile || "",
              village: c.village || "",
              taluk: c.taluk || "",
              district: c.district || "",
              address: c.address || "",
              gst: c.gst || "",
              remarks: c.remarks || "",
              branch_id: c.branch_id || "",
              preferred_language: c.preferred_language || "en",
              whatsapp_enabled: c.whatsapp_enabled !== false,
            });
          }
        } catch (e: any) {
          if (active) toast.show(e.message || "Failed to load customer", "error");
        } finally {
          if (active) setLoading(false);
        }
      })();
    } else {
      setLoading(false);
    }
    return () => { active = false; };
  }, [id, isEdit]);

  useEffect(() => {
    if (!isEdit && user) {
      setForm(f => {
        if (f.branch_id) return f;
        const defaultBranch = user.role === "Admin"
          ? (user.branch_id || branches[0]?.id || "")
          : (user.branch_id || "");
        return { ...f, branch_id: defaultBranch };
      });
    }
  }, [isEdit, user, branches]);

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim() || !form.mobile.trim()) {
      toast.show("Name and mobile are required", "error");
      return;
    }
    setSaving(true);
    try {
      const trimmedName = form.name.trim();
      const trimmedVillage = form.village.trim();
      let finalName = trimmedName;
      if (trimmedVillage && !trimmedName.toLowerCase().includes(trimmedVillage.toLowerCase())) {
        finalName = `${trimmedName} ${trimmedVillage}`;
      }
      const payload = { ...form, name: finalName };

      if (isEdit && id) {
        await api(`/customers/${id}`, { method: "PUT", body: payload });
        await storage.removeItem("cached_customers");
        toast.show("Customer updated successfully");
      } else {
        const c = await api<any>("/customers", { method: "POST", body: payload });
        await storage.removeItem("cached_customers");
        toast.show(`Customer ${c.name} (${c.code}) created successfully`);
      }
      router.back();
    } catch (e: any) {
      toast.show(e.message || "Failed to save customer", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="customer-form-close">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{isEdit ? "Edit Customer" : "New Customer"}</Text>
        <View style={{ width: 22 }} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl }} keyboardShouldPersistTaps="handled">
          <Input testID="cf-name" label="Customer Name *" value={form.name} onChangeText={v => set("name", v)} placeholder="Full name" />
          <Input testID="cf-mobile" label="Phone / Mobile Number *" value={form.mobile} onChangeText={v => set("mobile", v)} keyboardType="phone-pad" placeholder="10-digit number" maxLength={15} />
          
          {user?.role === "Admin" ? (
            <Picker
              testID="cf-branch"
              label="Branch *"
              value={form.branch_id}
              onChange={v => set("branch_id", v)}
              options={branches.map(b => ({ id: b.id, name: b.name }))}
              placeholder="Select branch..."
            />
          ) : (
            <Input
              testID="cf-branch-readonly"
              label="Branch"
              value={branches.find(b => b.id === form.branch_id)?.name || "—"}
              editable={false}
            />
          )}

          <Input testID="cf-alt-mobile" label="Alternative Phone" value={form.alt_mobile} onChangeText={v => set("alt_mobile", v)} keyboardType="phone-pad" />

          {/* WhatsApp Updates Toggle */}
          <View style={styles.switchCard}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <MaterialCommunityIcons name="whatsapp" size={18} color={form.whatsapp_enabled ? "#25D366" : colors.textMuted} />
                <Text style={styles.switchLabel}>WhatsApp Updates</Text>
              </View>
              <Text style={styles.switchSublabel}>
                {form.whatsapp_enabled
                  ? "Customer receives receipts & delivery alerts on WhatsApp"
                  : "Disabled — Customer uses basic keypad phone without WhatsApp"}
              </Text>
            </View>
            <Switch
              testID="cf-whatsapp-switch"
              value={form.whatsapp_enabled}
              onValueChange={v => setForm(f => ({ ...f, whatsapp_enabled: v }))}
              trackColor={{ false: "#CBD5E1", true: "#86EFAC" }}
              thumbColor={form.whatsapp_enabled ? colors.primary : "#94A3B8"}
            />
          </View>

          {form.whatsapp_enabled && (
            <Picker
              testID="cf-language"
              label="WhatsApp Notification Language"
              value={form.preferred_language}
              onChange={v => set("preferred_language", v)}
              options={LANGUAGE_OPTIONS}
              placeholder="Select language..."
            />
          )}
          <Input testID="cf-village" label="Village / Town" value={form.village} onChangeText={v => set("village", v)} />
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}><Input testID="cf-taluk" label="Taluk" value={form.taluk} onChangeText={v => set("taluk", v)} /></View>
            <View style={{ flex: 1 }}><Input testID="cf-district" label="City / District" value={form.district} onChangeText={v => set("district", v)} placeholder="City / District" /></View>
          </View>
          <Input testID="cf-address" label="Full Address" value={form.address} onChangeText={v => set("address", v)} multiline />
          <Input testID="cf-gst" label="GST Number" value={form.gst} onChangeText={v => set("gst", v)} placeholder="Optional" autoCapitalize="characters" />
          <Input testID="cf-remarks" label="Remarks" value={form.remarks} onChangeText={v => set("remarks", v)} multiline />
          <View style={{ height: spacing.md }} />
          <Button testID="cf-save" title={isEdit ? "Update Customer" : "Save Customer"} onPress={save} loading={saving} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  switchCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    marginBottom: spacing.md,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  switchSublabel: {
    fontSize: 11.5,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
});
