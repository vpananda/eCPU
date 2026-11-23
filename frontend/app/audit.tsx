import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, radius, shadow, spacing } from "@/src/theme";

const ACTION_ICONS: Record<string, string> = {
  create: "plus-circle",
  create_arrival: "arrow-down-bold-circle",
  update: "pencil",
  update_batch: "pencil",
  delete: "delete-forever",
  update_status: "swap-horizontal",
  delivery: "truck-check",
  load: "tray-arrow-down",
  stop: "stop-circle",
};

const ACTION_COLORS: Record<string, string> = {
  create: "#2E7D32",
  create_arrival: "#2E7D32",
  update: "#1565C0",
  update_batch: "#1565C0",
  delete: "#C62828",
  update_status: "#F57C00",
  delivery: "#7B1FA2",
  load: "#E65100",
  stop: "#455A64",
};

const FILTER_TABS = [
  { key: "all", label: "All Activity" },
  { key: "batch", label: "Arrivals & Batches" },
  { key: "payment", label: "Payments" },
  { key: "customer", label: "Customers" },
  { key: "expense", label: "Expenses" },
];

export default function Audit() {
  const router = useRouter();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");

  const load = useCallback(async (filterKey: string) => {
    setLoading(true);
    try {
      const q = filterKey !== "all" ? `?entity=${filterKey}` : "";
      const res = await api<any[]>(`/audit${q}`);
      setList(res || []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(activeTab);
    }, [load, activeTab])
  );

  const getEntityBadge = (item: any) => {
    const bno = item.after?.batch_no || item.before?.batch_no;
    if (bno) return `Batch ${bno}`;
    const cname = item.after?.name || item.before?.name;
    if (cname && item.entity === "customer") return `Customer: ${cname}`;
    const pAmt = item.after?.amount || item.before?.amount;
    if (pAmt && item.entity === "payment") return `₹${Number(pAmt).toLocaleString("en-IN")}`;
    const eCat = item.after?.category || item.before?.category;
    if (eCat && item.entity === "expense") return `${eCat}: ₹${item.after?.amount || item.before?.amount || 0}`;
    return null;
  };

  const getSummaryDiff = (item: any) => {
    if (item.action === "delete") {
      const bno = item.before?.batch_no;
      if (bno) return `Permanently deleted Batch ${bno}`;
      return `Deleted ${item.entity} record`;
    }
    if (item.action === "update_batch" && item.before && item.after) {
      const changes: string[] = [];
      if (item.after.raw_weight && item.before.raw_weight !== item.after.raw_weight) {
        changes.push(`Weight: ${item.before.raw_weight}kg ➔ ${item.after.raw_weight}kg`);
      }
      if (item.after.rate_per_kg && item.before.rate_per_kg !== item.after.rate_per_kg) {
        changes.push(`Rate: ₹${item.before.rate_per_kg} ➔ ₹${item.after.rate_per_kg}`);
      }
      if (item.after.bags && item.before.bags !== item.after.bags) {
        changes.push(`Bags: ${item.before.bags} ➔ ${item.after.bags}`);
      }
      if (item.after.status && item.before.status !== item.after.status) {
        changes.push(`Status: ${item.before.status} ➔ ${item.after.status}`);
      }
      if (changes.length > 0) return changes.join(" · ");
    }
    return null;
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="audit-back" style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>User Activity & Audit</Text>
        <TouchableOpacity onPress={() => load(activeTab)} style={styles.backBtn}>
          <MaterialCommunityIcons name="refresh" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.sm }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
          {FILTER_TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[styles.filterChip, activeTab === tab.key && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, activeTab === tab.key && styles.filterChipTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(i, idx) => i.id || String(idx)}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120, gap: spacing.md }}
          ListEmptyComponent={<Text style={styles.empty}>No audit log entries found for this filter.</Text>}
          renderItem={({ item }) => {
            const badge = getEntityBadge(item);
            const diff = getSummaryDiff(item);
            const isDelete = item.action === "delete";

            return (
              <View style={[styles.item, isDelete && styles.itemDelete]}>
                <View style={[styles.icon, { backgroundColor: `${ACTION_COLORS[item.action] || colors.primary}18` }]}>
                  <MaterialCommunityIcons
                    name={(ACTION_ICONS[item.action] as any) || "circle"}
                    size={20}
                    color={ACTION_COLORS[item.action] || colors.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
                    <Text style={[styles.action, isDelete && { color: "#C62828" }]}>
                      {item.action.replace(/_/g, " ")} · {item.entity}
                    </Text>
                    {badge && (
                      <View style={[styles.entityBadge, isDelete && { backgroundColor: "#FFEBEE", borderColor: "#FFCDD2" }]}>
                        <Text style={[styles.entityBadgeText, isDelete && { color: "#C62828" }]}>{badge}</Text>
                      </View>
                    )}
                  </View>

                  {diff && (
                    <Text style={styles.diffText}>
                      {diff}
                    </Text>
                  )}

                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <MaterialCommunityIcons name="account-circle" size={14} color={colors.textMuted} />
                    <Text style={styles.meta}>
                      <Text style={{ fontWeight: "700", color: colors.text }}>{item.user_name || item.user_role}</Text>
                      {item.user_mobile ? ` (${item.user_mobile})` : ""}
                      {item.user_role ? ` · ${item.user_role}` : ""}
                    </Text>
                  </View>

                  <Text style={styles.date}>
                    {new Date(item.timestamp).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true
                    })}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: `${colors.text}08`
  },
  title: { fontSize: 18, fontWeight: "800", color: colors.text },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted
  },
  filterChipTextActive: {
    color: "#fff"
  },
  item: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: radius.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card
  },
  itemDelete: {
    borderColor: "#FFCDD2",
    backgroundColor: "#FFF8F8"
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2
  },
  action: { fontSize: 14, fontWeight: "800", color: colors.text, textTransform: "capitalize" },
  entityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: `${colors.primary}12`,
    borderWidth: 1,
    borderColor: `${colors.primary}25`
  },
  entityBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary
  },
  diffText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1565C0",
    marginTop: 3,
    backgroundColor: "#E3F2FD",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start"
  },
  meta: { fontSize: 12, color: colors.textMuted },
  date: { fontSize: 11, color: colors.textLight, marginTop: 4 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
});
