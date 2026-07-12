import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { StatusPill } from "@/src/components/ui";

type Batch = {
  id: string; batch_no: string; status: string; raw_weight: number;
  customer?: { id: string; name: string; code: string; mobile: string };
  product?: { name: string };
  balance_amount?: number;
};

export default function DeliveryPicker() {
  const router = useRouter();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all non-delivered batches (ready to be handed over)
      const all = await api<Batch[]>("/batches");
      setBatches(all.filter(b => b.status !== "Delivered"));
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    if (!q.trim()) return batches;
    const term = q.toLowerCase();
    return batches.filter(b =>
      b.customer?.name?.toLowerCase().includes(term) ||
      b.customer?.mobile?.includes(term) ||
      b.batch_no?.toLowerCase().includes(term)
    );
  }, [batches, q]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="delivery-picker-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Select for Delivery</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.searchWrap}>
        <MaterialCommunityIcons name="magnify" size={18} color={colors.textMuted} />
        <TextInput
          testID="delivery-picker-search"
          style={styles.search}
          placeholder="Search customer or batch..."
          placeholderTextColor={colors.textLight}
          value={q}
          onChangeText={setQ}
        />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.sm, paddingBottom: 100 }}>
          {filtered.length === 0 && (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="package-variant-closed-remove" size={44} color={colors.textLight} />
              <Text style={styles.emptyText}>No batches available for delivery</Text>
            </View>
          )}
          {filtered.map(b => (
            <TouchableOpacity
              key={b.id}
              testID={`delivery-pick-${b.id}`}
              style={styles.item}
              activeOpacity={0.85}
              onPress={() => router.push(`/delivery/${b.id}`)}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(b.customer?.name || "?").slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{b.customer?.name}</Text>
                  <StatusPill status={b.status} />
                </View>
                <Text style={styles.meta}>{b.batch_no} · {b.product?.name} · {b.raw_weight}kg</Text>
                <Text style={styles.phone}>{b.customer?.mobile}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textLight} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: spacing.xl, backgroundColor: colors.card, borderRadius: radius.lg, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border },
  search: { flex: 1, paddingVertical: 12, fontSize: 14, color: colors.text },
  item: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, padding: spacing.md, borderRadius: radius.xl, gap: spacing.md, ...shadow.card },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary50, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 17, fontWeight: "800", color: colors.primary },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontSize: 15, fontWeight: "800", color: colors.text, flexShrink: 1 },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  phone: { fontSize: 11, color: colors.textLight, marginTop: 2 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 6 },
  emptyText: { fontSize: 14, color: colors.textMuted, fontWeight: "600", marginTop: 8, textAlign: "center" },
});
