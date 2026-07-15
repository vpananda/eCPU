import React, { useCallback, useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import { Input } from "@/src/components/Input";
import { Button } from "@/src/components/Button";
import { Picker } from "@/src/components/Picker";
import { colors, radius, shadow, spacing } from "@/src/theme";

type Branch = { id: string; name: string };

type SpiceRateLine = {
  product_id: string;
  product_name: string;
  default_rate: number;
  rate: string; // string type for inputs
};

export default function BranchRatesScreen() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();

  const isAdmin = user?.role === "Admin";
  const managerBranchId = user?.branch_id || "";

  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [spiceRates, setSpiceRates] = useState<SpiceRateLine[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [loadingRates, setLoadingRates] = useState(false);
  const [saving, setSaving] = useState(false);

  // 1. Fetch branches list on mount
  useEffect(() => {
    (async () => {
      try {
        const list = await api<Branch[]>("/branches");
        setBranches(list);
        
        if (isAdmin) {
          if (list.length > 0) {
            setSelectedBranchId(list[0].id);
          }
        } else {
          setSelectedBranchId(managerBranchId);
        }
      } catch (e: any) {
        toast.show(e.message || "Failed to load branches", "error");
      } finally {
        setLoadingBranches(false);
      }
    })();
  }, [isAdmin, managerBranchId, toast]);

  // 2. Fetch rates whenever selected branch changes
  const loadRates = useCallback(async (branchId: string) => {
    setLoadingRates(true);
    try {
      const data = await api<{ product_id: string; product_name: string; default_rate: number; rate: number }[]>(
        `/branches/${branchId}/rates`
      );
      setSpiceRates(
        data.map((item) => ({
          product_id: item.product_id,
          product_name: item.product_name,
          default_rate: item.default_rate,
          rate: String(item.rate),
        }))
      );
    } catch (e: any) {
      toast.show(e.message || "Failed to load spice rates", "error");
    } finally {
      setLoadingRates(false);
    }
  }, [toast]);

  useEffect(() => {
    if (selectedBranchId) {
      loadRates(selectedBranchId);
    }
  }, [selectedBranchId, loadRates]);

  const handleRateChange = (productId: string, val: string) => {
    setSpiceRates((prev) =>
      prev.map((r) => (r.product_id === productId ? { ...r, rate: val } : r))
    );
  };

  const save = async () => {
    if (!selectedBranchId) return toast.show("Branch is required", "error");

    const payload = [];
    for (const item of spiceRates) {
      const rateVal = parseFloat(item.rate);
      if (isNaN(rateVal) || rateVal < 0) {
        return toast.show(`Enter a valid rate for ${item.product_name}`, "error");
      }
      payload.push({ product_id: item.product_id, rate: rateVal });
    }

    setSaving(true);
    try {
      await api(`/branches/${selectedBranchId}/rates`, {
        method: "PUT",
        body: payload,
      });
      toast.show("Drying rates updated successfully!");
    } catch (e: any) {
      toast.show(e.message || "Failed to save drying rates", "error");
    } finally {
      setSaving(false);
    }
  };

  const selectedBranchName = branches.find((b) => b.id === selectedBranchId)?.name || "Branch";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="rates-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Branch Spice Rates</Text>
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        {loadingBranches ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.hint}>
              <MaterialCommunityIcons name="information-outline" size={16} color={colors.primary} />
              <Text style={styles.hintText}>
                {isAdmin
                  ? "Configure custom drying rates per kg for spices in each branch. Default rates apply if not customized."
                  : "Configure custom drying rates per kg for spices in your branch. Default rates apply if not customized."}
              </Text>
            </View>

            {/* Branch Selector (Admin) or Label (Manager) */}
            {isAdmin ? (
              <Picker
                testID="rates-branch-picker"
                label="Select Branch"
                placeholder="Choose a branch"
                value={selectedBranchId}
                onChange={setSelectedBranchId}
                options={branches.map((b) => ({ id: b.id, name: b.name }))}
              />
            ) : (
              <View style={styles.readonlyField}>
                <Text style={styles.readonlyLabel}>Branch</Text>
                <View style={styles.readonlyBox}>
                  <MaterialCommunityIcons name="office-building" size={16} color={colors.primary} />
                  <Text style={styles.readonlyValue}>{selectedBranchName}</Text>
                  <View style={styles.lockChip}>
                    <MaterialCommunityIcons name="lock-outline" size={12} color={colors.textMuted} />
                    <Text style={styles.lockChipText}>Assigned</Text>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.ratesSection}>
              <Text style={styles.sectionTitle}>Spices Rates List</Text>
              
              {loadingRates ? (
                <ActivityIndicator style={{ marginVertical: 30 }} color={colors.primary} />
              ) : spiceRates.length === 0 ? (
                <Text style={styles.emptyText}>No spices configured. Add spices under Spices Configuration first.</Text>
              ) : (
                spiceRates.map((sr) => (
                  <View key={sr.product_id} style={styles.rateRow} testID={`rate-row-${sr.product_name.toLowerCase()}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.spiceName}>{sr.product_name}</Text>
                      <Text style={styles.defaultRateLabel}>Global Default: ₹{sr.default_rate.toFixed(2)}/kg</Text>
                    </View>
                    <View style={{ width: 120 }}>
                      <Input
                        testID={`rate-input-${sr.product_name.toLowerCase().replace(" ", "-")}`}
                        value={sr.rate}
                        onChangeText={(val) => handleRateChange(sr.product_id, val)}
                        keyboardType="decimal-pad"
                        placeholder={String(sr.default_rate)}
                        style={{ marginBottom: 0 }}
                      />
                    </View>
                  </View>
                ))
              )}
            </View>

            {spiceRates.length > 0 && (
              <Button
                testID="rates-save-submit"
                title="Save Drying Rates"
                onPress={save}
                loading={saving}
                style={{ marginTop: spacing.lg }}
              />
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { fontSize: 18, fontWeight: "800", color: colors.text },
  scroll: { padding: spacing.xl, paddingBottom: 40 },
  hint: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: colors.primary50, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.lg },
  hintText: { flex: 1, fontSize: 12, color: colors.primaryDark, fontWeight: "500", lineHeight: 16 },
  
  readonlyField: { marginBottom: spacing.md },
  readonlyLabel: { fontSize: 12, fontWeight: "700", color: colors.textMuted, marginBottom: 6, letterSpacing: 0.3, textTransform: "uppercase" },
  readonlyBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.primary50, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.primaryLight + "60", paddingHorizontal: spacing.md, paddingVertical: 12 },
  readonlyValue: { flex: 1, fontSize: 15, fontWeight: "800", color: colors.primaryDark },
  lockChip: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: "#ffffffb0" },
  lockChipText: { fontSize: 10, fontWeight: "800", color: colors.textMuted, letterSpacing: 0.4, textTransform: "uppercase" },

  ratesSection: { marginTop: spacing.md, backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.lg, ...shadow.card },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: colors.text, marginBottom: spacing.md, textTransform: "uppercase", letterSpacing: 0.4 },
  rateRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  spiceName: { fontSize: 15, fontWeight: "800", color: colors.text },
  defaultRateLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2, fontWeight: "600" },
  emptyText: { textAlign: "center", color: colors.textMuted, marginVertical: 20, fontSize: 14 },
});
