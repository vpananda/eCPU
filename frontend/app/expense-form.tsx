import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import { Input } from "@/src/components/Input";
import { Button } from "@/src/components/Button";
import { colors, radius, spacing } from "@/src/theme";

export default function ExpenseForm() {
  const router = useRouter();
  const toast = useToast();
  const [cats, setCats] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [vendor, setVendor] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<string[]>("/expense-categories").then(c => { setCats(c); if (c.length) setCategory(c[0]); });
  }, []);

  const submit = async () => {
    const a = parseFloat(amount);
    if (!category) { toast.show("Select category", "error"); return; }
    if (!a || a <= 0) { toast.show("Enter valid amount", "error"); return; }
    setSaving(true);
    try {
      await api("/expenses", { method: "POST", body: { category, amount: a, vendor, remarks } });
      toast.show("Expense recorded");
      router.back();
    } catch (e: any) { toast.show(e.message, "error"); }
    finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="expense-form-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Add Expense</Text>
        <View style={{ width: 22 }} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl }} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Category</Text>
          <View style={styles.catGrid}>
            {cats.map(c => (
              <TouchableOpacity
                key={c}
                testID={`expense-cat-${c.toLowerCase().replace(/\s/g, "-")}`}
                style={[styles.catChip, category === c && styles.catChipActive]}
                onPress={() => setCategory(c)}
              >
                <Text style={[styles.catText, category === c && { color: "#fff" }]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Input testID="expense-amount" label="Amount (₹) *" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="0.00" />
          <Input testID="expense-vendor" label="Vendor" value={vendor} onChangeText={setVendor} placeholder="Optional" />
          <Input testID="expense-remarks" label="Remarks" value={remarks} onChangeText={setRemarks} multiline />
          <Button testID="expense-submit" title="Save Expense" onPress={submit} loading={saving} />
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
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md },
  catChip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border },
  catChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  catText: { fontSize: 12, color: colors.text, fontWeight: "700" },
});
