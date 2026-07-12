import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, radius, shadow, spacing } from "@/src/theme";

export default function PaymentPicker() {
  const router = useRouter();
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await api<any[]>("/batches");
      setBatches(all.filter(b => (b.balance_amount || 0) > 0));
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    if (!q.trim()) return batches;
    const t = q.toLowerCase();
    return batches.filter(b =>
      b.customer?.name?.toLowerCase().includes(t) ||
      b.customer?.mobile?.includes(t) ||
      b.batch_no?.toLowerCase().includes(t)
    );
  }, [batches, q]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="pp-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Collect Payment</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.searchWrap}>
        <MaterialCommunityIcons name="magnify" size={18} color={colors.textMuted} />
        <TextInput
          testID="pp-search"
          style={styles.search}
          placeholder="Search batches with pending balance..."
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
              <MaterialCommunityIcons name="check-circle-outline" size={44} color={colors.success} />
              <Text style={styles.emptyText}>No pending balances</Text>
            </View>
          )}
          {filtered.map(b => (
            <TouchableOpacity
              key={b.id}
              testID={`pp-item-${b.id}`}
              style={styles.item}
              activeOpacity={0.85}
              onPress={() => router.push(`/payment/${b.id}`)}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(b.customer?.name || "?").slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{b.customer?.name}</Text>
                <Text style={styles.meta}>{b.batch_no} · Bill ₹{b.bill_amount?.toFixed(0)} · Paid ₹{b.total_paid?.toFixed(0)}</Text>
              </View>
              <View style={styles.balance}>
                <Text style={styles.balanceLabel}>Due</Text>
                <Text style={styles.balanceValue}>₹{b.balance_amount?.toFixed(0)}</Text>
              </View>
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
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.accent + "20", alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 17, fontWeight: "800", color: colors.accent },
  name: { fontSize: 15, fontWeight: "800", color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  balance: { alignItems: "flex-end" },
  balanceLabel: { fontSize: 10, color: colors.textMuted, fontWeight: "800", letterSpacing: 0.3, textTransform: "uppercase" },
  balanceValue: { fontSize: 17, color: colors.accent, fontWeight: "800", marginTop: 2 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 6 },
  emptyText: { fontSize: 14, color: colors.textMuted, fontWeight: "700", marginTop: 8 },
});
