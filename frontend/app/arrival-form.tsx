import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, Image, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import { Input } from "@/src/components/Input";
import { Button } from "@/src/components/Button";
import { Picker } from "@/src/components/Picker";
import { colors, radius, spacing } from "@/src/theme";

type Customer = { id: string; code: string; name: string; mobile: string; branch_id?: string };
type Product = { id: string; name: string; default_rate: number };

function todayISO() { return new Date().toISOString().slice(0, 10); }

async function pickImageAsBase64(): Promise<string | null> {
  try {
    // Dynamic import to avoid heavy load on unrelated screens
    // @ts-ignore
    const ImagePicker = await import("expo-image-picker");
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") return null;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.6,
    });
    if (res.canceled || !res.assets?.[0]?.base64) return null;
    const a = res.assets[0];
    return `data:${a.mimeType || "image/jpeg"};base64,${a.base64}`;
  } catch (e) {
    return null;
  }
}

export default function ArrivalForm() {
  const router = useRouter();
  const toast = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [arrivalDate, setArrivalDate] = useState(todayISO());
  const [rawWeight, setRawWeight] = useState("");
  const [bags, setBags] = useState("");
  const [bagWeight, setBagWeight] = useState("");
  const [rate, setRate] = useState("12");
  const [remarks, setRemarks] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([
        api<Customer[]>("/customers"),
        api<Product[]>("/products"),
      ]);
      setCustomers(c);
      setProducts(p);
    } finally { setLoadingData(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const selectedProduct = products.find(p => p.id === productId);
  useEffect(() => {
    if (selectedProduct && selectedProduct.default_rate > 0) {
      setRate(String(selectedProduct.default_rate));
    }
  }, [selectedProduct]);

  const submit = async () => {
    if (!customerId) return toast.show("Select customer", "error");
    if (!productId) return toast.show("Select product (type of spice)", "error");
    const w = parseFloat(rawWeight);
    if (!w || w <= 0) return toast.show("Enter valid weight", "error");
    setSaving(true);
    try {
      const b = await api<any>("/arrivals", {
        method: "POST",
        body: {
          customer_id: customerId,
          product_id: productId,
          arrival_date: arrivalDate,
          raw_weight: w,
          bags: parseInt(bags || "0", 10),
          bag_weight: parseFloat(bagWeight || "0"),
          rate_per_kg: parseFloat(rate || "12"),
          remarks,
          photos,
        },
      });
      toast.show(`Arrival ${b.batch_no} recorded`);
      router.replace(`/batch/${b.id}`);
    } catch (e: any) {
      toast.show(e.message || "Failed", "error");
    } finally { setSaving(false); }
  };

  const addPhoto = async () => {
    const b64 = await pickImageAsBase64();
    if (b64) setPhotos(prev => [...prev, b64]);
    else toast.show("Could not add photo", "error");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="arrival-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>New Arrival</Text>
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        {loadingData ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <View style={styles.hint}>
              <MaterialCommunityIcons name="information-outline" size={16} color={colors.primary} />
              <Text style={styles.hintText}>Record wet produce received. Machine will be assigned when loading.</Text>
            </View>

            <Picker
              testID="arrival-customer"
              label="Customer"
              placeholder="Select customer"
              value={customerId}
              onChange={setCustomerId}
              options={customers.map(c => ({ id: c.id, name: c.name, sub: `${c.code} · ${c.mobile}` }))}
            />

            <Picker
              testID="arrival-product"
              label="Type of Spices"
              placeholder="Select product"
              value={productId}
              onChange={setProductId}
              options={products.map(p => ({ id: p.id, name: p.name, meta: `₹${p.default_rate}/kg` }))}
            />

            <Input testID="arrival-date" label="Arrival Date" value={arrivalDate} onChangeText={setArrivalDate} placeholder="YYYY-MM-DD" />

            <Input testID="arrival-weight" label="Weight (kg) *" keyboardType="decimal-pad" value={rawWeight} onChangeText={setRawWeight} placeholder="e.g. 200" />

            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Input testID="arrival-bags" label="No. of Bags" keyboardType="number-pad" value={bags} onChangeText={setBags} />
              </View>
              <View style={{ flex: 1 }}>
                <Input testID="arrival-bag-weight" label="Bag Weight (kg)" keyboardType="decimal-pad" value={bagWeight} onChangeText={setBagWeight} />
              </View>
            </View>

            <Input testID="arrival-rate" label="Rate per kg (₹)" keyboardType="decimal-pad" value={rate} onChangeText={setRate} />

            {/* Photos */}
            <Text style={styles.label}>Photos (optional)</Text>
            <View style={styles.photoRow}>
              {photos.map((p, i) => (
                <View key={i} style={styles.photoWrap}>
                  <Image source={{ uri: p }} style={styles.photo} />
                  <TouchableOpacity
                    testID={`arrival-photo-remove-${i}`}
                    style={styles.photoRemove}
                    onPress={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                  >
                    <MaterialCommunityIcons name="close" size={12} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity testID="arrival-photo-add" style={styles.photoAdd} onPress={addPhoto}>
                <MaterialCommunityIcons name="camera-plus" size={22} color={colors.primary} />
                <Text style={styles.photoAddText}>Add</Text>
              </TouchableOpacity>
            </View>

            <Input testID="arrival-remarks" label="Remarks" value={remarks} onChangeText={setRemarks} multiline placeholder="Optional notes" />

            <View style={{ height: spacing.md }} />
            <Button testID="arrival-submit" title="Record Arrival" onPress={submit} loading={saving} />
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  hint: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: colors.primary50, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.lg },
  hintText: { flex: 1, fontSize: 12, color: colors.primaryDark, fontWeight: "500", lineHeight: 16 },
  label: { fontSize: 12, fontWeight: "700", color: colors.textMuted, marginBottom: 6, letterSpacing: 0.3, textTransform: "uppercase" },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  photoWrap: { position: "relative" },
  photo: { width: 80, height: 80, borderRadius: radius.md, backgroundColor: colors.border },
  photoRemove: { position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" },
  photoAdd: { width: 80, height: 80, borderRadius: radius.md, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.primary, alignItems: "center", justifyContent: "center", gap: 2 },
  photoAddText: { fontSize: 11, color: colors.primary, fontWeight: "700" },
});
