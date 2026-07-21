import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, Stack } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import { Input } from "@/src/components/Input";
import { colors, radius, shadow, spacing } from "@/src/theme";

export default function ExpenseCategoriesAdmin() {
  const router = useRouter();
  const toast = useToast();

  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCategory, setNewCategory] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingVal, setEditingVal] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await api<string[]>("/expense-categories");
      setCategories(list);
    } catch (e: any) {
      toast.show(e.message || "Failed to load expense categories", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleSave = async (updatedList: string[]) => {
    setSaving(true);
    try {
      await api("/expense-categories", {
        method: "PUT",
        body: { categories: updatedList },
      });
      setCategories(updatedList);
      toast.show("Expense categories updated");
    } catch (e: any) {
      toast.show(e.message || "Failed to update categories", "error");
    } finally {
      setSaving(false);
    }
  };

  const addCategory = () => {
    const trimmed = newCategory.trim();
    if (!trimmed) {
      toast.show("Please enter a category name", "error");
      return;
    }
    if (categories.includes(trimmed)) {
      toast.show("Category already exists", "error");
      return;
    }
    const updated = [...categories, trimmed];
    setNewCategory("");
    handleSave(updated);
  };

  const deleteCategory = (categoryName: string) => {
    Alert.alert(
      "Delete Category",
      `Are you sure you want to delete "${categoryName}"? This will not affect existing expenses using this category but will remove it from the dropdown options.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            const updated = categories.filter((c) => c !== categoryName);
            handleSave(updated);
          },
        },
      ]
    );
  };

  const startEdit = (index: number, val: string) => {
    setEditingIndex(index);
    setEditingVal(val);
  };

  const saveEdit = () => {
    const trimmed = editingVal.trim();
    if (!trimmed) {
      toast.show("Category name cannot be empty", "error");
      return;
    }
    if (categories.includes(trimmed) && categories[editingIndex!] !== trimmed) {
      toast.show("Category name already exists", "error");
      return;
    }
    const updated = [...categories];
    updated[editingIndex!] = trimmed;
    setEditingIndex(null);
    setEditingVal("");
    handleSave(updated);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="expense-categories-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Expense Ledgers</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.addCard}>
            <Text style={styles.sectionTitle}>Add New Ledger</Text>
            <View style={styles.rowInput}>
              <View style={{ flex: 1 }}>
                <Input
                  testID="new-category-input"
                  placeholder="e.g. Chemical Cost"
                  value={newCategory}
                  onChangeText={setNewCategory}
                />
              </View>
              <TouchableOpacity
                testID="add-category-btn"
                style={[styles.addBtn, saving && { opacity: 0.6 }]}
                disabled={saving}
                onPress={addCategory}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <MaterialCommunityIcons name="plus" size={22} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.listCard}>
            <Text style={styles.sectionTitle}>Current Ledgers ({categories.length})</Text>
            {categories.map((c, i) => (
              <View key={i} style={styles.itemRow}>
                {editingIndex === i ? (
                  <View style={styles.editRow}>
                    <View style={{ flex: 1 }}>
                      <Input
                        testID={`edit-category-input-${i}`}
                        value={editingVal}
                        onChangeText={setEditingVal}
                      />
                    </View>
                    <TouchableOpacity
                      testID={`save-edit-btn-${i}`}
                      style={styles.saveEditBtn}
                      onPress={saveEdit}
                    >
                      <MaterialCommunityIcons name="check" size={18} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={`cancel-edit-btn-${i}`}
                      style={styles.cancelEditBtn}
                      onPress={() => setEditingIndex(null)}
                    >
                      <MaterialCommunityIcons name="close" size={18} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <View style={styles.itemDetails}>
                      <MaterialCommunityIcons name="label-outline" size={18} color={colors.primary} />
                      <Text style={styles.itemText}>{c}</Text>
                    </View>
                    <View style={styles.actions}>
                      <TouchableOpacity
                        testID={`edit-category-btn-${i}`}
                        onPress={() => startEdit(i, c)}
                        style={styles.actionBtn}
                      >
                        <MaterialCommunityIcons name="pencil" size={18} color={colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        testID={`delete-category-btn-${i}`}
                        onPress={() => deleteCategory(c)}
                        style={styles.actionBtn}
                      >
                        <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  container: { padding: spacing.xl, gap: spacing.lg, paddingBottom: 120 },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: colors.textMuted, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: spacing.md },
  addCard: { backgroundColor: colors.card, padding: spacing.lg, borderRadius: radius.xl, ...shadow.card },
  rowInput: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: -10 },
  addBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginTop: 6 },
  listCard: { backgroundColor: colors.card, padding: spacing.lg, borderRadius: radius.xl, ...shadow.card },
  itemRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemDetails: { flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1 },
  itemText: { fontSize: 15, fontWeight: "700", color: colors.text },
  actions: { flexDirection: "row", gap: spacing.md },
  actionBtn: { width: 34, height: 34, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  editRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1, marginTop: -10 },
  saveEditBtn: { width: 34, height: 34, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginTop: 6 },
  cancelEditBtn: { width: 34, height: 34, borderRadius: radius.md, backgroundColor: colors.border, alignItems: "center", justifyContent: "center", marginTop: 6 },
});
