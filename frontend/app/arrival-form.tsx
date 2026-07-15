import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, Image, ActivityIndicator, Modal } from "react-native";
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

type Customer = { id: string; code: string; name: string; mobile: string; branch_id?: string };
type Product = { id: string; name: string; default_rate: number };
type Branch = { id: string; name: string };

function todayISO() { return new Date().toISOString().slice(0, 10); }

async function pickFromLibrary(): Promise<string | null> {
  try {
    // @ts-ignore
    const ImagePicker = await import("expo-image-picker");
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") return null;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.55,
      allowsMultipleSelection: false,
    });
    if (res.canceled || !res.assets?.[0]?.base64) return null;
    const a = res.assets[0];
    return `data:${a.mimeType || "image/jpeg"};base64,${a.base64}`;
  } catch { return null; }
}

async function takeWithCamera(): Promise<string | null> {
  try {
    // @ts-ignore
    const ImagePicker = await import("expo-image-picker");
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== "granted") return null;
    const res = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.55,
    });
    if (res.canceled || !res.assets?.[0]?.base64) return null;
    const a = res.assets[0];
    return `data:${a.mimeType || "image/jpeg"};base64,${a.base64}`;
  } catch { return null; }
}

export default function ArrivalForm() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();

  const isAdmin = user?.role === "Admin";

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [branchId, setBranchId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [arrivalDate, setArrivalDate] = useState(todayISO());
  const [rawWeight, setRawWeight] = useState("");
  const [bags, setBags] = useState("");
  const [receivedFrom, setReceivedFrom] = useState("");
  const [receivedFromEdited, setReceivedFromEdited] = useState(false);
  const [rate, setRate] = useState("12");
  const [remarks, setRemarks] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, p, b] = await Promise.all([
        api<Customer[]>("/customers"),
        api<Product[]>("/products"),
        api<Branch[]>("/branches"),
      ]);
      setCustomers(c);
      setProducts(p);
      setBranches(b);
      // Default branch: admin gets first branch, others get their own
      if (user?.role === "Admin") {
        setBranchId((prev) => prev || b[0]?.id || null);
      } else {
        setBranchId(user?.branch_id || b[0]?.id || null);
      }
      // Make default spices as cardamom
      const cardamom = p.find(prod => prod.name.toLowerCase() === "cardamom");
      if (cardamom) {
        setProductId((prev) => prev || cardamom.id);
      }
    } finally { setLoadingData(false); }
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const selectedProduct = products.find(p => p.id === productId);
  const selectedCustomer = customers.find(c => c.id === customerId);
  const selectedBranch = branches.find(b => b.id === branchId);

  useEffect(() => {
    if (selectedProduct && selectedProduct.default_rate > 0) {
      setRate(String(selectedProduct.default_rate));
    }
  }, [selectedProduct]);

  // Auto-fill "Received From" with customer name unless user has edited it
  useEffect(() => {
    if (selectedCustomer && !receivedFromEdited) {
      setReceivedFrom(selectedCustomer.name);
    }
  }, [selectedCustomer, receivedFromEdited]);

  const submit = async () => {
    if (!customerId) return toast.show("Select customer", "error");
    if (!productId) return toast.show("Select product (type of spice)", "error");
    const w = parseFloat(rawWeight);
    if (!w || w <= 0) return toast.show("Enter valid weight", "error");
    if (!branchId) return toast.show("Branch required", "error");
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
          rate_per_kg: parseFloat(rate || "12"),
          received_from: receivedFrom.trim(),
          branch_id: branchId,
          remarks,
          photos,
        },
      });
      toast.show(`Arrival ${b.batch_no} recorded`);
      router.replace("/arrivals");
    } catch (e: any) {
      toast.show(e.message || "Failed", "error");
    } finally { setSaving(false); }
  };

  const addPhoto = (mode: "camera" | "library") => async () => {
    setPhotoSheet(false);
    const fn = mode === "camera" ? takeWithCamera : pickFromLibrary;
    const b64 = await fn();
    if (b64) setPhotos(prev => [...prev, b64]);
    else toast.show(mode === "camera" ? "Camera permission needed" : "Could not open gallery", "error");
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

            {/* Branch — Admin can select; others locked */}
            {isAdmin ? (
              <Picker
                testID="arrival-branch"
                label="Branch / Store"
                placeholder="Select branch"
                value={branchId}
                onChange={setBranchId}
                options={branches.map(b => ({ id: b.id, name: b.name }))}
              />
            ) : (
              <View style={styles.readonlyField}>
                <Text style={styles.readonlyLabel}>Branch / Store</Text>
                <View style={styles.readonlyBox}>
                  <MaterialCommunityIcons name="office-building" size={16} color={colors.primary} />
                  <Text style={styles.readonlyValue}>{selectedBranch?.name || "—"}</Text>
                  <View style={styles.lockChip}>
                    <MaterialCommunityIcons name="lock-outline" size={12} color={colors.textMuted} />
                    <Text style={styles.lockChipText}>Assigned</Text>
                  </View>
                </View>
              </View>
            )}

            <Picker
              testID="arrival-customer"
              label="Customer"
              placeholder="Select customer"
              value={customerId}
              onChange={(id) => { setCustomerId(id); setReceivedFromEdited(false); }}
              options={customers.map(c => ({ id: c.id, name: c.name, sub: `${c.code} · ${c.mobile}` }))}
            />

            <Input
              testID="arrival-received-from"
              label="Received From"
              value={receivedFrom}
              onChangeText={(v) => { setReceivedFrom(v); setReceivedFromEdited(true); }}
              placeholder="Person delivering the produce"
              leftIcon={<MaterialCommunityIcons name="account-arrow-right" size={16} color={colors.textMuted} />}
            />
            <Text style={styles.helper}>
              Defaults to customer name. Change it if a helper or driver brings the produce.
            </Text>

            <Picker
              testID="arrival-product"
              label="Type of Spices"
              placeholder="Select product"
              value={productId}
              onChange={setProductId}
              options={products.map(p => ({ id: p.id, name: p.name, meta: `₹${p.default_rate}/kg` }))}
            />

            <Input testID="arrival-date" label="Arrival Date" value={arrivalDate} onChangeText={setArrivalDate} placeholder="YYYY-MM-DD" />

            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <View style={{ flex: 2 }}>
                <Input testID="arrival-weight" label="Weight (kg) *" keyboardType="decimal-pad" value={rawWeight} onChangeText={setRawWeight} placeholder="e.g. 200" />
              </View>
              <View style={{ flex: 1 }}>
                <Input testID="arrival-bags" label="Bags" keyboardType="number-pad" value={bags} onChangeText={setBags} />
              </View>
            </View>

            <Input testID="arrival-rate" label="Rate per kg (₹)" keyboardType="decimal-pad" value={rate} onChangeText={setRate} />

            {/* Photos */}
            <Text style={styles.label}>Photos</Text>
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
              <TouchableOpacity testID="arrival-photo-add" style={styles.photoAdd} onPress={() => setPhotoSheet(true)}>
                <MaterialCommunityIcons name="camera-plus" size={26} color={colors.primary} />
                <Text style={styles.photoAddText}>Add Photo</Text>
              </TouchableOpacity>
            </View>

            <Input testID="arrival-remarks" label="Remarks" value={remarks} onChangeText={setRemarks} multiline placeholder="Optional notes" />

            <View style={{ height: spacing.md }} />
            <Button testID="arrival-submit" title="Record Arrival" onPress={submit} loading={saving} />
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      {/* Photo source bottom sheet */}
      <Modal transparent visible={photoSheet} animationType="fade" onRequestClose={() => setPhotoSheet(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setPhotoSheet(false)} />
        <View style={styles.sheetWrap}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Add photo</Text>
            <TouchableOpacity testID="photo-camera" style={styles.sheetOption} onPress={addPhoto("camera")}>
              <View style={[styles.sheetIcon, { backgroundColor: colors.primary + "18" }]}>
                <MaterialCommunityIcons name="camera" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetLabel}>Take Photo</Text>
                <Text style={styles.sheetSub}>Use your device camera</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textLight} />
            </TouchableOpacity>
            <TouchableOpacity testID="photo-gallery" style={styles.sheetOption} onPress={addPhoto("library")}>
              <View style={[styles.sheetIcon, { backgroundColor: colors.info + "18" }]}>
                <MaterialCommunityIcons name="image-multiple" size={22} color={colors.info} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetLabel}>Choose from Gallery</Text>
                <Text style={styles.sheetSub}>Pick from photos on this device</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textLight} />
            </TouchableOpacity>
            <TouchableOpacity testID="photo-cancel" style={styles.sheetCancel} onPress={() => setPhotoSheet(false)}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  helper: { fontSize: 11, color: colors.textMuted, marginTop: -8, marginBottom: spacing.md, marginLeft: 2, fontStyle: "italic" },

  readonlyField: { marginBottom: spacing.md },
  readonlyLabel: { fontSize: 12, fontWeight: "700", color: colors.textMuted, marginBottom: 6, letterSpacing: 0.3, textTransform: "uppercase" },
  readonlyBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.primary50, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.primaryLight + "60", paddingHorizontal: spacing.md, paddingVertical: 12 },
  readonlyValue: { flex: 1, fontSize: 15, fontWeight: "800", color: colors.primaryDark },
  lockChip: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: "#ffffffb0" },
  lockChipText: { fontSize: 10, fontWeight: "800", color: colors.textMuted, letterSpacing: 0.4, textTransform: "uppercase" },

  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  photoWrap: { position: "relative" },
  photo: { width: 82, height: 82, borderRadius: radius.md, backgroundColor: colors.border },
  photoRemove: { position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" },
  photoAdd: { width: 82, height: 82, borderRadius: radius.md, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.primary, alignItems: "center", justifyContent: "center", gap: 2, backgroundColor: colors.primary50 },
  photoAddText: { fontSize: 11, color: colors.primary, fontWeight: "700" },

  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.5)" },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, padding: spacing.xl, paddingBottom: spacing.xxl, ...shadow.card },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: colors.text, marginBottom: spacing.md },
  sheetOption: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  sheetIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  sheetLabel: { fontSize: 15, fontWeight: "800", color: colors.text },
  sheetSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  sheetCancel: { marginTop: spacing.md, paddingVertical: 12, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border, alignItems: "center" },
  sheetCancelText: { fontSize: 14, fontWeight: "700", color: colors.textMuted },
});
