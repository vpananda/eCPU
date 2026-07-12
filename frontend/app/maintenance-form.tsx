import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import { Input } from "@/src/components/Input";
import { Button } from "@/src/components/Button";
import { colors, spacing } from "@/src/theme";

export default function MaintenanceForm() {
  const params = useLocalSearchParams<{ machine_id?: string }>();
  const router = useRouter();
  const toast = useToast();
  const [machines, setMachines] = useState<any[]>([]);
  const [machineId, setMachineId] = useState<string>((params.machine_id as string) || "");
  const [complaint, setComplaint] = useState("");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  const [technician, setTechnician] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { api<any[]>("/machines").then(setMachines); }, []);

  const submit = async () => {
    if (!machineId) { toast.show("Select machine", "error"); return; }
    if (!complaint) { toast.show("Enter complaint", "error"); return; }
    setSaving(true);
    try {
      await api("/maintenance", {
        method: "POST",
        body: { machine_id: machineId, complaint, description, cost: parseFloat(cost || "0"), technician, status: "Open" },
      });
      toast.show("Maintenance logged");
      router.back();
    } catch (e: any) { toast.show(e.message, "error"); }
    finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="maintenance-form-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Log Maintenance</Text>
        <View style={{ width: 22 }} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl }} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Machine</Text>
          <View style={styles.machineList}>
            {machines.map(m => (
              <TouchableOpacity
                key={m.id}
                testID={`mf-machine-${m.id}`}
                style={[styles.mach, machineId === m.id && styles.machActive]}
                onPress={() => setMachineId(m.id)}
              >
                <Text style={[styles.machText, machineId === m.id && { color: "#fff" }]}>{m.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Input testID="mf-complaint" label="Complaint *" value={complaint} onChangeText={setComplaint} placeholder="e.g. Belt broken" />
          <Input testID="mf-description" label="Description" value={description} onChangeText={setDescription} multiline />
          <Input testID="mf-cost" label="Maintenance Cost (₹)" keyboardType="decimal-pad" value={cost} onChangeText={setCost} />
          <Input testID="mf-technician" label="Technician" value={technician} onChangeText={setTechnician} />
          <Button testID="mf-submit" title="Save" onPress={submit} loading={saving} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  label: { fontSize: 12, fontWeight: "700", color: colors.textMuted, marginBottom: 6, letterSpacing: 0.3, textTransform: "uppercase" },
  machineList: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md },
  mach: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border },
  machActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  machText: { fontSize: 13, color: colors.text, fontWeight: "700" },
});
