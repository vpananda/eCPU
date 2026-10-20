import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, ActivityIndicator } from "react-native";
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
    if (!form.name || !form.mobile) {
      toast.show("Name and mobile are required", "error");
      return;
    }
    setSaving(true);
    try {
      if (isEdit && id) {
        await api(`/customers/${id}`, { method: "PUT", body: form });
        await storage.removeItem("cached_customers");
        toast.show("Customer updated successfully");
      } else {
        const c = await api<any>("/customers", { method: "POST", body: form });
        await storage.removeItem("cached_customers");
        toast.show(`Customer ${c.code} created`);
      }
      router.back();
    } catch (e: any) {
      toast.show(e.message, "error");
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
});
