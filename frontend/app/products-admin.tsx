import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Modal, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, Stack } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import { Input } from "@/src/components/Input";
import { Button } from "@/src/components/Button";
import { colors, radius, shadow, spacing } from "@/src/theme";

type Product = {
  id: string;
  name: string;
  default_rate: number;
  branch_rates: Record<string, number>;
};

type BranchRateLine = {
  branch_id: string;
  branch_name: string;
  rate: string; // string type for text inputs
};

export default function ProductsAdmin() {
  const router = useRouter();
  const toast = useToast();
  
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Spice Form Modal State
  const [spiceModalOpen, setSpiceModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [spiceName, setSpiceName] = useState("");
  const [defaultRate, setDefaultRate] = useState("");
  const [savingSpice, setSavingSpice] = useState(false);

  // Branch Rates Modal State
  const [ratesModalOpen, setRatesModalOpen] = useState(false);
  const [ratesProduct, setRatesProduct] = useState<Product | null>(null);
  const [branchRates, setBranchRates] = useState<BranchRateLine[]>([]);
  const [loadingRates, setLoadingRates] = useState(false);
  const [savingRates, setSavingRates] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await api<Product[]>("/products");
      setProducts(list);
    } catch (e: any) {
      toast.show(e.message || "Failed to load spices", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openNewSpice = () => {
    setEditingProduct(null);
    setSpiceName("");
    setDefaultRate("");
    setSpiceModalOpen(true);
  };

  const openEditSpice = (p: Product) => {
    setEditingProduct(p);
    setSpiceName(p.name);
    setDefaultRate(String(p.default_rate));
    setSpiceModalOpen(true);
  };

  const openBranchRates = async (p: Product) => {
    setRatesProduct(p);
    setRatesModalOpen(true);
    setLoadingRates(true);
    try {
      // Fetch branch rates configuration from backend
      const data = await api<{ branch_id: string; branch_name: string; rate: number }[]>(`/products/${p.id}/rates`);
      setBranchRates(data.map(item => ({
        branch_id: item.branch_id,
        branch_name: item.branch_name,
        rate: String(item.rate)
      })));
    } catch (e: any) {
      toast.show(e.message || "Failed to load branch rates", "error");
      setRatesModalOpen(false);
    } finally {
      setLoadingRates(false);
    }
  };

  const deleteSpice = (p: Product) => {
    const performDelete = async () => {
      setLoading(true);
      try {
        await api(`/products/${p.id}`, { method: "DELETE" });
        toast.show("Spice product deleted");
        await load();
      } catch (err: any) {
        toast.show(err.message || "Failed to delete spice", "error");
      } finally {
        setLoading(false);
      }
    };

    if (Platform.OS === "web") {
      const confirmed = window.confirm(`Are you sure you want to delete spice "${p.name}"? This will delete all branch configurations. Check that no active batch is using it.`);
      if (confirmed) performDelete();
    } else {
      Alert.alert(
        "Delete Spice",
        `Are you sure you want to delete spice "${p.name}"? This will delete all branch configurations. Check that no active batch is using it.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: performDelete }
        ]
      );
    }
  };

  const saveSpice = async () => {
    if (!spiceName.trim()) return toast.show("Spice name is required", "error");
    const rateVal = parseFloat(defaultRate);
    if (isNaN(rateVal) || rateVal < 0) return toast.show("Enter a valid default rate", "error");

    setSavingSpice(true);
    try {
      if (editingProduct) {
        await api(`/products/${editingProduct.id}`, {
          method: "PUT",
          body: { name: spiceName.trim(), default_rate: rateVal }
        });
        toast.show("Spice updated successfully");
      } else {
        await api("/products", {
          method: "POST",
          body: { name: spiceName.trim(), default_rate: rateVal }
        });
        toast.show("Spice created successfully");
      }
      setSpiceModalOpen(false);
      await load();
    } catch (e: any) {
      toast.show(e.message || "Failed to save spice", "error");
    } finally {
      setSavingSpice(false);
    }
  };

  const saveBranchRates = async () => {
    if (!ratesProduct) return;
    
    // Validate rates
    const payload = [];
    for (const r of branchRates) {
      const rateVal = parseFloat(r.rate);
      if (isNaN(rateVal) || rateVal < 0) {
        return toast.show(`Enter a valid rate for ${r.branch_name}`, "error");
      }
      payload.push({ branch_id: r.branch_id, rate: rateVal });
    }

    setSavingRates(true);
    try {
      await api(`/products/${ratesProduct.id}/rates`, {
        method: "PUT",
        body: payload
      });
      toast.show("Branch rates updated successfully");
      setRatesModalOpen(false);
      await load();
    } catch (e: any) {
      toast.show(e.message || "Failed to save branch rates", "error");
    } finally {
      setSavingRates(false);
    }
  };

  const handleRateChange = (branchId: string, val: string) => {
    setBranchRates(prev => prev.map(r => r.branch_id === branchId ? { ...r, rate: val } : r));
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="spices-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Spices Configuration</Text>
        <TouchableOpacity onPress={openNewSpice} testID="spice-add">
          <MaterialCommunityIcons name="plus" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {loading && products.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.hint}>
            <MaterialCommunityIcons name="information-outline" size={16} color={colors.primary} />
            <Text style={styles.hintText}>Configure spices and their branch rates. The system falls back to default rates if a branch rate is not customized.</Text>
          </View>

          {products.map((p) => (
            <View key={p.id} style={styles.card} testID={`spice-card-${p.name.toLowerCase()}`}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIconWrap}>
                  <MaterialCommunityIcons name="leaf" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName}>{p.name}</Text>
                  <Text style={styles.cardRate}>Default: ₹{p.default_rate.toFixed(2)}/kg</Text>
                </View>
                <View style={styles.actions}>
                  <TouchableOpacity onPress={() => openEditSpice(p)} style={styles.actionBtn}>
                    <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.info} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteSpice(p)} style={styles.actionBtn}>
                    <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.cardFooter}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ratesSummaryLabel}>Branch Configurations</Text>
                  <Text style={styles.ratesSummaryText}>
                    {Object.keys(p.branch_rates || {}).length > 0
                      ? `${Object.keys(p.branch_rates).length} branch overrides active`
                      : "Using default rates for all branches"}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => openBranchRates(p)} style={styles.ratesBtn}>
                  <MaterialCommunityIcons name="cog-outline" size={14} color={colors.primary} />
                  <Text style={styles.ratesBtnText}>Branch Rates</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Spice Add/Edit Modal */}
      <Modal transparent visible={spiceModalOpen} animationType="slide" onRequestClose={() => setSpiceModalOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setSpiceModalOpen(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalCentered}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingProduct ? "Edit Spice" : "Add Spice"}</Text>
            
            <Input
              testID="spice-name-input"
              label="Spice Name"
              placeholder="e.g. Cardamom, Pepper, Clove"
              value={spiceName}
              onChangeText={setSpiceName}
            />

            <Input
              testID="spice-rate-input"
              label="Default Rate per kg (₹)"
              placeholder="e.g. 12"
              keyboardType="decimal-pad"
              value={defaultRate}
              onChangeText={setDefaultRate}
            />

            <View style={styles.modalActions}>
              <Button
                testID="spice-cancel-btn"
                title="Cancel"
                variant="outline"
                onPress={() => setSpiceModalOpen(false)}
                style={{ flex: 1 }}
              />
              <Button
                testID="spice-save-btn"
                title="Save"
                onPress={saveSpice}
                loading={savingSpice}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Branch Rates Config Modal */}
      <Modal transparent visible={ratesModalOpen} animationType="slide" onRequestClose={() => setRatesModalOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setRatesModalOpen(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalCentered}>
          <View style={styles.modalContentLarge}>
            <Text style={styles.modalTitle}>Branch Rates: {ratesProduct?.name}</Text>
            <Text style={styles.modalSubtitle}>Customize drying rate (₹/kg) per branch for this spice product.</Text>

            {loadingRates ? (
              <ActivityIndicator style={{ marginVertical: 30 }} color={colors.primary} />
            ) : (
              <ScrollView style={{ maxHeight: 300, marginVertical: spacing.md }}>
                {branchRates.map((br) => (
                  <View key={br.branch_id} style={styles.branchRateRow}>
                    <Text style={styles.branchName}>{br.branch_name}</Text>
                    <View style={{ width: 100 }}>
                      <Input
                        testID={`branch-rate-input-${br.branch_name.toLowerCase().replace(" ", "-")}`}
                        value={br.rate}
                        onChangeText={(val) => handleRateChange(br.branch_id, val)}
                        keyboardType="decimal-pad"
                        placeholder={String(ratesProduct?.default_rate)}
                        style={{ marginBottom: 0 }}
                      />
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}

            <View style={styles.modalActions}>
              <Button
                testID="rates-cancel-btn"
                title="Cancel"
                variant="outline"
                onPress={() => setRatesModalOpen(false)}
                style={{ flex: 1 }}
              />
              <Button
                testID="rates-save-btn"
                title="Save Rates"
                onPress={saveBranchRates}
                loading={savingRates}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  card: { backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md, ...shadow.card },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  cardIconWrap: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.primary50, alignItems: "center", justifyContent: "center" },
  cardName: { fontSize: 16, fontWeight: "800", color: colors.text },
  cardRate: { fontSize: 12, color: colors.textMuted, marginTop: 2, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 8 },
  actionBtn: { padding: 8, borderRadius: 8, backgroundColor: colors.bg },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  ratesSummaryLabel: { fontSize: 11, fontWeight: "800", color: colors.textMuted, textTransform: "uppercase" },
  ratesSummaryText: { fontSize: 12, color: colors.text, marginTop: 2, fontWeight: "600" },
  ratesBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.primary50 },
  ratesBtnText: { fontSize: 12, fontWeight: "700", color: colors.primary },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.5)" },
  modalCentered: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.xl },
  modalContent: { backgroundColor: colors.card, borderRadius: radius.xxl, padding: spacing.xl, width: "100%", maxWidth: 360, ...shadow.card },
  modalContentLarge: { backgroundColor: colors.card, borderRadius: radius.xxl, padding: spacing.xl, width: "100%", maxWidth: 440, ...shadow.card },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.text, marginBottom: spacing.xs },
  modalSubtitle: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.md },
  modalActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  branchRateRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  branchName: { fontSize: 14, fontWeight: "700", color: colors.text },
});
