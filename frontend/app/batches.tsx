import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { StatusPill } from "@/src/components/ui";

const STATUSES = ["All", "Received", "Loaded", "Drying", "Completed", "Delivered"];

export default function BatchesScreen() {
  const router = useRouter();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const path = filter === "All" ? "/batches" : `/batches?status=${encodeURIComponent(filter)}`;
      const d = await api<any[]>(path);
      setList(d);
    } finally { setLoading(false); }
  }, [filter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="batches-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Batches</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        {STATUSES.map(s => (
          <TouchableOpacity
            key={s}
            testID={`batches-filter-${s.toLowerCase()}`}
            style={[styles.chip, filter === s && styles.chipActive]}
            onPress={() => setFilter(s)}
          >
            <Text style={[styles.chipText, filter === s && { color: "#fff" }]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120, gap: spacing.md }}
          ListEmptyComponent={() => (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="package-variant-closed" size={48} color={colors.textLight} />
              <Text style={styles.emptyText}>No batches</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`batch-list-${item.id}`}
              style={styles.item}
              onPress={() => router.push(`/batch/${item.id}`)}
              activeOpacity={0.85}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={styles.batchNo}>{item.batch_no}</Text>
                  <StatusPill status={item.status} />
                </View>
                <Text style={styles.customerName}>{item.customer?.name || "-"}</Text>
                <View style={styles.metaRow}>
                  <Text style={styles.meta}>{item.product?.name} · {item.raw_weight}kg · {item.machine?.name}</Text>
                </View>
                <Text style={styles.bill}>
                  ₹{(item.bill_amount || 0).toFixed(0)}
                  {item.balance_amount > 0 ? <Text style={{ color: colors.accent }}>  · Bal ₹{item.balance_amount.toFixed(0)}</Text> : null}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textLight} />
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  chipsRow: { paddingHorizontal: spacing.xl, gap: 8, paddingVertical: spacing.sm },
  chip: { paddingHorizontal: 16, height: 36, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, justifyContent: "center", flexShrink: 0 },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: "700", color: colors.text },
  item: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, padding: spacing.md, borderRadius: radius.xl, gap: spacing.md, ...shadow.card },
  batchNo: { fontSize: 14, fontWeight: "800", color: colors.text },
  customerName: { fontSize: 15, fontWeight: "700", color: colors.text, marginTop: 6 },
  metaRow: { marginTop: 2 },
  meta: { fontSize: 12, color: colors.textMuted },
  bill: { fontSize: 13, color: colors.primary, fontWeight: "700", marginTop: 4 },
  empty: { alignItems: "center", paddingVertical: 60 },
  emptyText: { fontSize: 16, color: colors.textMuted, fontWeight: "700", marginTop: 12 },
});
