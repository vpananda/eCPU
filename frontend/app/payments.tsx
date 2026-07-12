import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, radius, shadow, spacing } from "@/src/theme";

const MODE_COLORS: Record<string, string> = {
  Cash: "#43A047", UPI: "#7B1FA2", Bank: "#1565C0", Credit: "#F57C00",
};

export default function PaymentsScreen() {
  const router = useRouter();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const d = await api<any[]>("/payments");
      setList(d);
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const total = list.reduce((s, p) => s + p.amount, 0);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="payments-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Payments</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.totalCard}>
        <View>
          <Text style={styles.totalLabel}>Total Collected</Text>
          <Text style={styles.totalValue}>₹{total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</Text>
          <Text style={styles.totalSub}>{list.length} payments</Text>
        </View>
        <MaterialCommunityIcons name="cash-multiple" size={40} color="#fff" />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120, gap: spacing.sm }}
          ListEmptyComponent={<Text style={styles.empty}>No payments yet</Text>}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <View style={[styles.icon, { backgroundColor: `${MODE_COLORS[item.mode] || colors.primary}20` }]}>
                <MaterialCommunityIcons name="cash" size={20} color={MODE_COLORS[item.mode] || colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.amount}>₹{item.amount.toFixed(2)}</Text>
                  <View style={[styles.modeChip, { backgroundColor: `${MODE_COLORS[item.mode]}20` }]}>
                    <Text style={[styles.modeText, { color: MODE_COLORS[item.mode] || colors.primary }]}>{item.mode}</Text>
                  </View>
                </View>
                <Text style={styles.meta}>{item.customer_name || "-"} · {item.batch_no}</Text>
                <Text style={styles.date}>{new Date(item.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</Text>
              </View>
            </View>
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
  totalCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.primary, marginHorizontal: spacing.xl, padding: spacing.xl, borderRadius: radius.xxl, ...shadow.card },
  totalLabel: { color: "#B9F6CA", fontSize: 12, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  totalValue: { color: "#fff", fontSize: 28, fontWeight: "800", marginTop: 4 },
  totalSub: { color: "#E8F5E9", fontSize: 12, marginTop: 2 },
  item: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, padding: spacing.md, borderRadius: radius.lg, gap: spacing.md, ...shadow.card },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  amount: { fontSize: 16, fontWeight: "800", color: colors.text },
  modeChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  modeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  date: { fontSize: 11, color: colors.textLight, marginTop: 1 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
});
