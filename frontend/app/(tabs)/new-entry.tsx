import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import { Input } from "@/src/components/Input";
import { Button } from "@/src/components/Button";
import { colors, radius, shadow, spacing } from "@/src/theme";

type Customer = { id: string; name: string; code: string; mobile: string };
type Product = { id: string; name: string; default_rate: number };
type Machine = { id: string; name: string; capacity: number; status: string };

const STEPS = ["Customer", "Product", "Weight", "Machine", "Charges"];

export default function NewEntry() {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");

  const [form, setForm] = useState({
    customer_id: "",
    product_id: "",
    raw_weight: "",
    estimated_dry_weight: "",
    moisture: "",
    bags: "",
    bag_weight: "",
    machine_id: "",
    rate_per_kg: "",
    loading_charges: "",
    discount: "",
    advance_paid: "",
    remarks: "",
  });

  const load = useCallback(async () => {
    try {
      const [c, p, m] = await Promise.all([
        api<Customer[]>("/customers"),
        api<Product[]>("/products"),
        api<Machine[]>("/machines"),
      ]);
      setCustomers(c);
      setProducts(p);
      setMachines(m);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    setStep(0);
  }, [load]));

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const selectedCustomer = customers.find(c => c.id === form.customer_id);
  const selectedProduct = products.find(p => p.id === form.product_id);
  const selectedMachine = machines.find(m => m.id === form.machine_id);

  const filteredCustomers = customerSearch
    ? customers.filter(c =>
        c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        c.mobile.includes(customerSearch))
    : customers;

  const rate = parseFloat(form.rate_per_kg || "0");
  const rawW = parseFloat(form.raw_weight || "0");
  const estDry = parseFloat(form.estimated_dry_weight || String(rawW));
  const loading = parseFloat(form.loading_charges || "0");
  const discount = parseFloat(form.discount || "0");
  const advance = parseFloat(form.advance_paid || "0");
  const bill = Math.max(0, estDry * rate + loading - discount);
  const balance = bill - advance;

  const canNext = () => {
    if (step === 0) return !!form.customer_id;
    if (step === 1) return !!form.product_id;
    if (step === 2) return rawW > 0;
    if (step === 3) return !!form.machine_id;
    if (step === 4) return rate > 0 && advance <= bill + 0.01;
    return true;
  };

  const submit = async () => {
    if (!canNext()) return;
    setSaving(true);
    try {
      const body = {
        customer_id: form.customer_id,
        product_id: form.product_id,
        raw_weight: rawW,
        estimated_dry_weight: estDry,
        moisture: parseFloat(form.moisture || "0"),
        bags: parseInt(form.bags || "0"),
        bag_weight: parseFloat(form.bag_weight || "0"),
        machine_id: form.machine_id,
        rate_per_kg: rate,
        loading_charges: loading,
        discount,
        advance_paid: advance,
        remarks: form.remarks,
        photos: [],
      };
      const b = await api<any>("/batches", { method: "POST", body });
      toast.show(`Batch ${b.batch_no} created`);
      router.replace(`/batch/${b.id}`);
    } catch (e: any) {
      toast.show(e.message || "Failed to create batch", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>New Drying Entry</Text>
        <TouchableOpacity testID="new-entry-close" onPress={() => router.back()}>
          <MaterialCommunityIcons name="close" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Stepper */}
      <View style={styles.steps}>
        {STEPS.map((s, i) => (
          <View key={s} style={styles.stepItem}>
            <View style={[styles.stepDot, i <= step ? styles.stepDotActive : null, i === step && styles.stepDotCurrent]}>
              {i < step ? (
                <MaterialCommunityIcons name="check" size={14} color="#fff" />
              ) : (
                <Text style={[styles.stepDotText, i <= step ? { color: "#fff" } : null]}>{i + 1}</Text>
              )}
            </View>
            {i < STEPS.length - 1 ? <View style={[styles.stepLine, i < step ? { backgroundColor: colors.primary } : null]} /> : null}
          </View>
        ))}
      </View>
      <Text style={styles.stepLabel}>{STEPS[step]}</Text>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 200 }} keyboardShouldPersistTaps="handled">
          {step === 0 && (
            <View>
              <View style={styles.searchRow}>
                <Input
                  testID="new-entry-customer-search"
                  placeholder="Search customer name / mobile..."
                  value={customerSearch}
                  onChangeText={setCustomerSearch}
                  leftIcon={<MaterialCommunityIcons name="magnify" size={18} color={colors.textMuted} />}
                />
                <TouchableOpacity testID="new-entry-add-customer" style={styles.addChip} onPress={() => router.push("/customer-form")}>
                  <MaterialCommunityIcons name="plus" size={14} color={colors.primary} />
                  <Text style={styles.addChipText}>New</Text>
                </TouchableOpacity>
              </View>
              {filteredCustomers.slice(0, 20).map(c => (
                <TouchableOpacity
                  key={c.id}
                  testID={`new-entry-customer-${c.id}`}
                  style={[styles.pickRow, form.customer_id === c.id && styles.pickRowActive]}
                  onPress={() => set("customer_id", c.id)}
                >
                  <View style={styles.avatar}><Text style={styles.avatarText}>{c.name.slice(0, 1).toUpperCase()}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickTitle}>{c.name}</Text>
                    <Text style={styles.pickMeta}>{c.code} · {c.mobile}</Text>
                  </View>
                  {form.customer_id === c.id && <MaterialCommunityIcons name="check-circle" size={22} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {step === 1 && (
            <View style={styles.productGrid}>
              {products.map(p => (
                <TouchableOpacity
                  key={p.id}
                  testID={`new-entry-product-${p.id}`}
                  style={[styles.productCard, form.product_id === p.id && styles.productCardActive]}
                  onPress={() => { set("product_id", p.id); if (!form.rate_per_kg) set("rate_per_kg", String(p.default_rate)); }}
                >
                  <MaterialCommunityIcons
                    name={form.product_id === p.id ? "leaf" : "leaf-maple"}
                    size={26}
                    color={form.product_id === p.id ? "#fff" : colors.primary}
                  />
                  <Text style={[styles.productName, form.product_id === p.id && { color: "#fff" }]}>{p.name}</Text>
                  <Text style={[styles.productRate, form.product_id === p.id && { color: "#E8F5E9" }]}>₹{p.default_rate}/kg</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {step === 2 && (
            <View>
              <Input testID="new-entry-raw-weight" label="Raw Weight (kg)" keyboardType="decimal-pad" value={form.raw_weight} onChangeText={v => set("raw_weight", v)} placeholder="e.g. 200" />
              <Input testID="new-entry-est-dry" label="Estimated Dry Weight (kg)" keyboardType="decimal-pad" value={form.estimated_dry_weight} onChangeText={v => set("estimated_dry_weight", v)} placeholder="Optional" />
              <Input testID="new-entry-moisture" label="Moisture %" keyboardType="decimal-pad" value={form.moisture} onChangeText={v => set("moisture", v)} placeholder="e.g. 25" />
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <View style={{ flex: 1 }}><Input testID="new-entry-bags" label="No. of Bags" keyboardType="number-pad" value={form.bags} onChangeText={v => set("bags", v)} /></View>
                <View style={{ flex: 1 }}><Input testID="new-entry-bag-weight" label="Bag Weight" keyboardType="decimal-pad" value={form.bag_weight} onChangeText={v => set("bag_weight", v)} /></View>
              </View>
            </View>
          )}

          {step === 3 && (
            <View style={{ gap: spacing.md }}>
              {machines.map(m => {
                const isRunning = m.status === "Running";
                return (
                  <TouchableOpacity
                    key={m.id}
                    testID={`new-entry-machine-${m.id}`}
                    disabled={isRunning}
                    style={[styles.machineCard, form.machine_id === m.id && styles.machineCardActive, isRunning && { opacity: 0.5 }]}
                    onPress={() => set("machine_id", m.id)}
                  >
                    <View style={[styles.machineIcon, { backgroundColor: `${colors.status[m.status]}20` }]}>
                      <MaterialCommunityIcons name="cog" size={22} color={colors.status[m.status]} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickTitle}>{m.name}</Text>
                      <Text style={styles.pickMeta}>Capacity: {m.capacity}kg · {m.status}</Text>
                    </View>
                    {form.machine_id === m.id && <MaterialCommunityIcons name="check-circle" size={22} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {step === 4 && (
            <View>
              <Input testID="new-entry-rate" label="Rate per kg (₹)" keyboardType="decimal-pad" value={form.rate_per_kg} onChangeText={v => set("rate_per_kg", v)} placeholder="e.g. 15" />
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <View style={{ flex: 1 }}><Input testID="new-entry-loading" label="Loading (₹)" keyboardType="decimal-pad" value={form.loading_charges} onChangeText={v => set("loading_charges", v)} /></View>
                <View style={{ flex: 1 }}><Input testID="new-entry-discount" label="Discount (₹)" keyboardType="decimal-pad" value={form.discount} onChangeText={v => set("discount", v)} /></View>
              </View>
              <Input testID="new-entry-advance" label="Advance Paid (₹)" keyboardType="decimal-pad" value={form.advance_paid} onChangeText={v => set("advance_paid", v)} placeholder="0" />
              <Input testID="new-entry-remarks" label="Remarks" value={form.remarks} onChangeText={v => set("remarks", v)} placeholder="Optional notes" />

              <View style={styles.summary}>
                <Text style={styles.summaryTitle}>Bill Summary</Text>
                <SummaryRow label="Customer" value={selectedCustomer?.name || "-"} />
                <SummaryRow label="Product" value={selectedProduct?.name || "-"} />
                <SummaryRow label="Machine" value={selectedMachine?.name || "-"} />
                <SummaryRow label="Dry × Rate" value={`${estDry.toFixed(1)} × ₹${rate.toFixed(2)} = ₹${(estDry * rate).toFixed(2)}`} />
                <SummaryRow label="+ Loading" value={`₹${loading.toFixed(2)}`} />
                <SummaryRow label="- Discount" value={`₹${discount.toFixed(2)}`} />
                <View style={styles.hr} />
                <SummaryRow label="Bill Amount" value={`₹${bill.toFixed(2)}`} bold />
                <SummaryRow label="Advance" value={`₹${advance.toFixed(2)}`} />
                <SummaryRow label="Balance" value={`₹${balance.toFixed(2)}`} bold accent />
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        {step > 0 ? (
          <Button testID="new-entry-back" title="Back" variant="outline" onPress={() => setStep(s => s - 1)} style={{ flex: 1 }} />
        ) : null}
        {step < STEPS.length - 1 ? (
          <Button
            testID="new-entry-next"
            title="Continue"
            onPress={() => canNext() && setStep(s => s + 1)}
            disabled={!canNext()}
            style={{ flex: 2 }}
          />
        ) : (
          <Button
            testID="new-entry-submit"
            title="Create Batch"
            onPress={submit}
            loading={saving}
            disabled={!canNext()}
            style={{ flex: 2 }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value, bold, accent }: { label: string; value: string; bold?: boolean; accent?: boolean }) {
  return (
    <View style={styles.sumRow}>
      <Text style={[styles.sumLabel, bold && { color: colors.text, fontWeight: "700" }]}>{label}</Text>
      <Text style={[styles.sumValue, bold && { fontWeight: "800" }, accent && { color: colors.accent }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: 22, fontWeight: "800", color: colors.text, letterSpacing: -0.4 },
  steps: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  stepItem: { flexDirection: "row", alignItems: "center", flex: 1 },
  stepDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.border, alignItems: "center", justifyContent: "center" },
  stepDotActive: { backgroundColor: colors.primary },
  stepDotCurrent: { transform: [{ scale: 1.15 }] },
  stepDotText: { fontSize: 11, fontWeight: "700", color: colors.textMuted },
  stepLine: { flex: 1, height: 2, backgroundColor: colors.border, marginHorizontal: 4 },
  stepLabel: { paddingHorizontal: spacing.xl, fontSize: 13, fontWeight: "700", color: colors.primary, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: spacing.sm },

  searchRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  addChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, height: 42, borderRadius: radius.pill, backgroundColor: colors.primary50, marginBottom: spacing.md },
  addChipText: { fontSize: 13, color: colors.primary, fontWeight: "700" },

  pickRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, padding: spacing.md, borderRadius: radius.lg, gap: spacing.md, marginBottom: spacing.sm, borderWidth: 1.5, borderColor: colors.border },
  pickRowActive: { borderColor: colors.primary, backgroundColor: colors.primary50 },
  pickTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  pickMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary50, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontWeight: "800", color: colors.primary },

  productGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  productCard: { width: "47.5%", padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.card, alignItems: "flex-start", borderWidth: 1.5, borderColor: colors.border, gap: 6 },
  productCardActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  productName: { fontSize: 15, fontWeight: "700", color: colors.text },
  productRate: { fontSize: 12, color: colors.textMuted },

  machineCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, padding: spacing.md, borderRadius: radius.lg, gap: spacing.md, borderWidth: 1.5, borderColor: colors.border },
  machineCardActive: { borderColor: colors.primary, backgroundColor: colors.primary50 },
  machineIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },

  summary: { backgroundColor: colors.primary50, padding: spacing.lg, borderRadius: radius.xl, marginTop: spacing.md },
  summaryTitle: { fontSize: 13, fontWeight: "800", color: colors.primaryDark, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: spacing.md },
  sumRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  sumLabel: { fontSize: 13, color: colors.textMuted },
  sumValue: { fontSize: 13, color: colors.text, fontWeight: "600" },
  hr: { height: 1, backgroundColor: "#ffffff90", marginVertical: 6 },

  footer: { flexDirection: "row", padding: spacing.lg, gap: spacing.md, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
});
