import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import { Input } from "@/src/components/Input";
import { Button } from "@/src/components/Button";
import { colors, radius, spacing } from "@/src/theme";

export default function DeliveryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [dryWeight, setDryWeight] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const w = parseFloat(dryWeight);
    if (!w || w <= 0) { toast.show("Enter actual dry weight", "error"); return; }
    if (!receivedBy) { toast.show("Enter received by", "error"); return; }
    setSaving(true);
    try {
      await api(`/batches/${id}/delivery`, {
        method: "POST",
        body: { actual_dry_weight: w, received_by: receivedBy, remarks, signature: "" },
      });
      toast.show("Batch delivered");
      router.back();
    } catch (e: any) { toast.show(e.message, "error"); }
    finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="delivery-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Delivery</Text>
        <View style={{ width: 22 }} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl }} keyboardShouldPersistTaps="handled">
          <View style={styles.info}>
            <MaterialCommunityIcons name="truck-check" size={32} color={colors.primary} />
            <Text style={styles.infoTitle}>Complete Delivery</Text>
            <Text style={styles.infoSub}>Enter final weight and receiver details. Bill will be recomputed on actual weight.</Text>
          </View>

          <Input testID="delivery-dry-weight" label="Actual Dry Weight (kg) *" keyboardType="decimal-pad" value={dryWeight} onChangeText={setDryWeight} placeholder="e.g. 180.5" />
          <Input testID="delivery-received-by" label="Received By *" value={receivedBy} onChangeText={setReceivedBy} placeholder="Name of receiver" />
          <Input testID="delivery-remarks" label="Remarks" value={remarks} onChangeText={setRemarks} multiline />

          <Button testID="delivery-submit" title="Confirm Delivery" onPress={submit} loading={saving} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  info: { alignItems: "center", gap: 6, marginBottom: spacing.xl, padding: spacing.lg, backgroundColor: colors.primary50, borderRadius: radius.xl },
  infoTitle: { fontSize: 17, fontWeight: "800", color: colors.text, marginTop: 6 },
  infoSub: { fontSize: 13, color: colors.textMuted, textAlign: "center", lineHeight: 18 },
});
