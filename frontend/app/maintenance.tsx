import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, radius, shadow, spacing } from "@/src/theme";

export default function MaintenanceList() {
  const router = useRouter();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setList(await api<any[]>("/maintenance")); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="maintenance-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Maintenance</Text>
        <TouchableOpacity testID="maintenance-add" style={styles.addBtn} onPress={() => router.push("/maintenance-form")}>
          <MaterialCommunityIcons name="plus" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120, gap: spacing.sm }}
          ListEmptyComponent={<Text style={styles.empty}>No maintenance records</Text>}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <View style={styles.icon}>
                <MaterialCommunityIcons name="wrench" size={20} color={colors.purple} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.machine}>{item.machine_name}</Text>
                <Text style={styles.complaint}>{item.complaint}</Text>
                <Text style={styles.meta}>{item.technician ? `${item.technician} · ` : ""}{new Date(item.date).toLocaleDateString("en-IN")}</Text>
              </View>
              {item.cost > 0 && <Text style={styles.cost}>₹{item.cost.toFixed(0)}</Text>}
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
  addBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.purple, alignItems: "center", justifyContent: "center" },
  item: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, padding: spacing.md, borderRadius: radius.lg, gap: spacing.md, ...shadow.card },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.purple + "20", alignItems: "center", justifyContent: "center" },
  machine: { fontSize: 15, fontWeight: "800", color: colors.text },
  complaint: { fontSize: 13, color: colors.text, marginTop: 2 },
  meta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  cost: { fontSize: 15, fontWeight: "800", color: colors.purple },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
});
