import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import { Input } from "@/src/components/Input";
import { Button } from "@/src/components/Button";
import { Picker } from "@/src/components/Picker";
import { colors, spacing } from "@/src/theme";

export default function CustomerForm() {
  const router = useRouter();
  const toast = useToast();
  const { user, branches } = useAuth();
  
  const [form, setForm] = useState({
    name: "", mobile: "", alt_mobile: "", village: "", taluk: "", district: "", address: "", gst: "", remarks: "", branch_id: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      if (user.role === "Admin") {
        setForm(f => ({ ...f, branch_id: f.branch_id || user.branch_id || branches[0]?.id || "" }));
      } else {
        setForm(f => ({ ...f, branch_id: user.branch_id || "" }));
      }
    }
  }, [user, branches]);

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name || !form.mobile) {
      toast.show("Name and mobile are required", "error");
      return;
    }
    setSaving(true);
    try {
      const c = await api<any>("/customers", { method: "POST", body: form });
      toast.show(`Customer ${c.code} created`);
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
        <TouchableOpacity onPress={() => router.back()} testID="customer-form-close">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>New Customer</Text>
        <View style={{ width: 22 }} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl }} keyboardShouldPersistTaps="handled">
          <Input testID="cf-name" label="Name *" value={form.name} onChangeText={v => set("name", v)} placeholder="Full name" />
          <Input testID="cf-mobile" label="Mobile *" value={form.mobile} onChangeText={v => set("mobile", v)} keyboardType="phone-pad" placeholder="10-digit number" maxLength={15} />
          
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

          <Input testID="cf-alt-mobile" label="Alternative Mobile" value={form.alt_mobile} onChangeText={v => set("alt_mobile", v)} keyboardType="phone-pad" />
          <Input testID="cf-village" label="Village" value={form.village} onChangeText={v => set("village", v)} />
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}><Input testID="cf-taluk" label="Taluk" value={form.taluk} onChangeText={v => set("taluk", v)} /></View>
            <View style={{ flex: 1 }}><Input testID="cf-district" label="District" value={form.district} onChangeText={v => set("district", v)} /></View>
          </View>
          <Input testID="cf-address" label="Address" value={form.address} onChangeText={v => set("address", v)} multiline />
          <Input testID="cf-gst" label="GST Number" value={form.gst} onChangeText={v => set("gst", v)} placeholder="Optional" autoCapitalize="characters" />
          <Input testID="cf-remarks" label="Remarks" value={form.remarks} onChangeText={v => set("remarks", v)} multiline />
          <View style={{ height: spacing.md }} />
          <Button testID="cf-save" title="Save Customer" onPress={save} loading={saving} />
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
