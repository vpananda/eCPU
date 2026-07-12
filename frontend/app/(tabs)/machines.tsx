import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { StatusPill } from "@/src/components/ui";

type Machine = {
  id: string; name: string; capacity: number; status: string;
  current_batch?: { id: string; batch_no: string; customer_name: string; expected_delivery_date?: string; status: string };
};

export default function MachinesScreen() {
  const router = useRouter();
  const [list, setList] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<Machine[]>("/machines");
      setList(d);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Machines</Text>
        <Text style={styles.subtitle}>{list.length} dryers</Text>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 40, alignItems: "center" }}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        >
          <View style={styles.grid}>
            {list.map(m => (
              <TouchableOpacity
                testID={`machine-${m.id}`}
                key={m.id}
                style={styles.card}
                onPress={() => router.push(`/machine/${m.id}`)}
                activeOpacity={0.85}
              >
                <View style={styles.cardTop}>
                  <View style={[styles.iconBox, { backgroundColor: `${colors.status[m.status]}15` }]}>
                    <MaterialCommunityIcons name="cog" size={26} color={colors.status[m.status]} />
                  </View>
                  <StatusPill status={m.status} />
                </View>
                <Text style={styles.machineName}>{m.name}</Text>
                <Text style={styles.capacity}>Capacity {m.capacity}kg</Text>

                {m.current_batch ? (
                  <View style={styles.batchInfo}>
                    <View style={styles.batchLabel}>
                      <MaterialCommunityIcons name="package-variant" size={12} color={colors.primary} />
                      <Text style={styles.batchLabelText}>{m.current_batch.batch_no}</Text>
                    </View>
                    <Text style={styles.batchCust} numberOfLines={1}>{m.current_batch.customer_name}</Text>
                  </View>
                ) : (
                  <View style={[styles.batchInfo, { backgroundColor: colors.border + "60" }]}>
                    <Text style={styles.emptyBatch}>No active batch</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { padding: spacing.xl, paddingBottom: spacing.md },
  title: { fontSize: 26, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  card: {
    width: "47.8%",
    backgroundColor: colors.card,
    borderRadius: radius.xxl,
    padding: spacing.lg,
    gap: 6,
    ...shadow.card,
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  iconBox: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  machineName: { fontSize: 16, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  capacity: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm },
  batchInfo: { backgroundColor: colors.primary50, padding: 8, borderRadius: radius.md, marginTop: 4 },
  batchLabel: { flexDirection: "row", alignItems: "center", gap: 4 },
  batchLabelText: { fontSize: 11, fontWeight: "800", color: colors.primary, letterSpacing: 0.3 },
  batchCust: { fontSize: 12, color: colors.text, fontWeight: "600", marginTop: 2 },
  emptyBatch: { fontSize: 11, color: colors.textMuted, fontWeight: "600", textAlign: "center" },
});
