import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, Image, Modal, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import { Input } from "@/src/components/Input";
import { Button } from "@/src/components/Button";
import { Picker } from "@/src/components/Picker";
import { colors, radius, shadow, spacing } from "@/src/theme";

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

export default function ExpenseForm() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const isAdmin = user?.role === "Admin";

  const [cats, setCats] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [vendor, setVendor] = useState("");
  const [remarks, setRemarks] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);

  useEffect(() => {
    api<any[]>("/branches")
      .then(list => {
        if (isAdmin) {
          setBranches(list);
          if (!id && user?.branch_id) {
            setBranchId(user.branch_id);
          }
        } else {
          const filtered = list.filter(b => b.id === user?.branch_id);
          setBranches(filtered);
          if (filtered.length && !id) {
            setBranchId(filtered[0].id);
          }
        }
      })
      .catch(() => {});
  }, [isAdmin, user, id]);

  useEffect(() => {
    setLoading(true);
    api<string[]>("/expense-categories")
      .then(c => {
        setCats(c);
        if (c.length && !id) setCategory(c[0]);
      })
      .catch(e => toast.show(e.message || "Failed to load categories", "error"))
      .finally(() => {
        if (!id) setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (id) {
      setLoading(true);
      api<any>(`/expenses/${id}`)
        .then(exp => {
          setCategory(exp.category);
          setAmount(String(exp.amount));
          setVendor(exp.vendor || "");
          setRemarks(exp.remarks || "");
          setPhotos(exp.bill_photos || (exp.bill_photo ? [exp.bill_photo] : []));
          setBranchId(exp.branch_id || null);
        })
        .catch(e => toast.show(e.message || "Failed to load expense", "error"))
        .finally(() => setLoading(false));
    }
  }, [id]);

  const submit = async () => {
    const a = parseFloat(amount);
    if (!branchId) { toast.show("Select branch", "error"); return; }
    if (!category) { toast.show("Select category", "error"); return; }
    if (!a || a <= 0) { toast.show("Enter valid amount", "error"); return; }
    setSaving(true);
    try {
      const payload = {
        category,
        amount: a,
        vendor,
        remarks,
        bill_photos: photos,
        branch_id: branchId || undefined
      };
      if (id) {
        await api(`/expenses/${id}`, {
          method: "PUT",
          body: payload
        });
        toast.show("Expense updated");
      } else {
        await api("/expenses", {
          method: "POST",
          body: payload
        });
        toast.show("Expense recorded");
      }
      router.back();
    } catch (e: any) { toast.show(e.message, "error"); }
    finally { setSaving(false); }
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Expense",
      "Are you sure you want to delete this expense entry?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await api(`/expenses/${id}`, { method: "DELETE" });
              toast.show("Expense deleted");
              router.back();
            } catch (e: any) {
              toast.show(e.message || "Failed to delete expense", "error");
            }
          }
        }
      ]
    );
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
        <TouchableOpacity onPress={() => router.back()} testID="expense-form-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{id ? "Edit Expense" : "Add Expense"}</Text>
        <View style={{ width: 22 }} />
      </View>
      
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
            <Picker
              testID="expense-branch"
              label="Branch *"
              placeholder="Select branch"
              value={branchId}
              onChange={setBranchId}
              options={branches.map(b => ({ id: b.id, name: b.name }))}
            />

            <Picker
              testID="expense-category"
              label="Category *"
              placeholder="Select category"
              value={category}
              onChange={setCategory}
              options={cats.map(c => ({ id: c, name: c }))}
            />

            <Input testID="expense-amount" label="Amount (₹) *" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="0.00" />
            <Input testID="expense-vendor" label="Vendor" value={vendor} onChangeText={setVendor} placeholder="Optional" />
            <Input testID="expense-remarks" label="Remarks" value={remarks} onChangeText={setRemarks} multiline />

            {/* Photos (Optional Multiple Photos) */}
            <Text style={styles.label}>Photos / Bill Copies (Optional)</Text>
            <View style={styles.photoRow}>
              {photos.map((p, i) => (
                <View key={i} style={styles.photoWrap}>
                  <Image source={{ uri: p }} style={styles.photo} />
                  <TouchableOpacity
                    testID={`expense-photo-remove-${i}`}
                    style={styles.photoRemove}
                    onPress={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                  >
                    <MaterialCommunityIcons name="close" size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity testID="expense-photo-add" style={styles.photoAdd} onPress={() => setPhotoSheet(true)}>
                <MaterialCommunityIcons name="camera-plus" size={24} color={colors.primary} />
                <Text style={styles.photoAddText}>Add Photo</Text>
              </TouchableOpacity>
            </View>

            <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
              <Button testID="expense-submit" title={id ? "Update Expense" : "Save Expense"} onPress={submit} loading={saving} />
              {id && isAdmin && (
                <Button
                  testID="expense-delete"
                  title="Delete Expense"
                  onPress={handleDelete}
                  variant="outline"
                  style={styles.deleteBtn}
                  textStyle={{ color: colors.danger }}
                />
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* Photo source bottom sheet */}
      <Modal transparent visible={photoSheet} animationType="fade" onRequestClose={() => setPhotoSheet(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setPhotoSheet(false)} />
        <View style={styles.sheetContainer}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add photo</Text>
            <TouchableOpacity testID="photo-camera" style={styles.sheetOption} onPress={addPhoto("camera")}>
              <View style={[styles.sheetIconWrap, { backgroundColor: "#E3F2FD" }]}>
                <MaterialCommunityIcons name="camera" size={20} color="#1E88E5" />
              </View>
              <View>
                <Text style={styles.sheetLabel}>Take Photo</Text>
                <Text style={styles.sheetSub}>Capture with your device camera</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity testID="photo-gallery" style={styles.sheetOption} onPress={addPhoto("library")}>
              <View style={[styles.sheetIconWrap, { backgroundColor: "#E8F5E9" }]}>
                <MaterialCommunityIcons name="image" size={20} color="#43A047" />
              </View>
              <View>
                <Text style={styles.sheetLabel}>Choose from Library</Text>
                <Text style={styles.sheetSub}>Pick from photos on this device</Text>
              </View>
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
  label: { fontSize: 12, fontWeight: "700", color: colors.textMuted, marginBottom: 8, letterSpacing: 0.3, textTransform: "uppercase" },
  deleteBtn: { borderColor: colors.danger, borderWidth: 1.5 },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md, marginTop: 4 },
  photoWrap: { position: "relative" },
  photo: { width: 82, height: 82, borderRadius: radius.md, backgroundColor: colors.border },
  photoRemove: { position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" },
  photoAdd: { width: 82, height: 82, borderRadius: radius.md, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.primary, alignItems: "center", justifyContent: "center", gap: 2, backgroundColor: colors.primary50 },
  photoAddText: { fontSize: 11, color: colors.primary, fontWeight: "700" },
  
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheetContainer: { position: "absolute", bottom: 0, left: 0, right: 0 },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, padding: spacing.xl, paddingBottom: spacing.xxl, ...shadow.card },
  sheetHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  sheetTitle: { fontSize: 17, fontWeight: "800", color: colors.text, marginBottom: spacing.md },
  sheetOption: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, gap: spacing.md },
  sheetIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  sheetLabel: { fontSize: 15, fontWeight: "700", color: colors.text },
  sheetSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  sheetCancel: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.md, marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  sheetCancelText: { fontSize: 15, fontWeight: "700", color: colors.textMuted },
});
