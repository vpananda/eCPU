import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, radius, shadow, spacing } from "@/src/theme";

const ACTION_ICONS: Record<string, string> = {
  create: "plus-circle", update: "pencil", delete: "delete", update_status: "swap-horizontal", delivery: "truck-check",
};
const ACTION_COLORS: Record<string, string> = {
  create: "#2E7D32", update: "#1565C0", delete: "#C62828", update_status: "#F57C00", delivery: "#7B1FA2",
};

export default function Audit() {
  const router = useRouter();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setList(await api<any[]>("/audit")); }
    catch { /* forbidden for non-admin */ }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="audit-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Audit Trail</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(i, idx) => i.id || String(idx)}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120, gap: spacing.sm }}
          ListEmptyComponent={<Text style={styles.empty}>No audit entries or access denied.</Text>}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <View style={[styles.icon, { backgroundColor: `${ACTION_COLORS[item.action] || colors.primary}20` }]}>
                <MaterialCommunityIcons name={(ACTION_ICONS[item.action] as any) || "circle"} size={18} color={ACTION_COLORS[item.action] || colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.action}>{item.action} · {item.entity}</Text>
                <Text style={styles.meta}>{item.user_role} ({item.user_mobile})</Text>
                <Text style={styles.date}>{new Date(item.timestamp).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</Text>
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
  item: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, padding: spacing.md, borderRadius: radius.lg, gap: spacing.md, ...shadow.card },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  action: { fontSize: 14, fontWeight: "800", color: colors.text, textTransform: "capitalize" },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  date: { fontSize: 11, color: colors.textLight, marginTop: 1 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
});
