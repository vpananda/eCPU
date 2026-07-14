import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, radius, shadow, spacing } from "@/src/theme";

type Customer = { id: string; code: string; name: string; mobile: string; village?: string; taluk?: string; district?: string; branch_id?: string; branch_name?: string; total_arrivals?: number; total_amount?: number; amount_received?: number };

export default function CustomersScreen() {
  const { branches, selectedBranchId, setSelectedBranchId } = useAuth();
  const router = useRouter();
  const [list, setList] = useState<Customer[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (search = "") => {
    setLoading(true);
    try {
      const path = search ? `/customers?q=${encodeURIComponent(search)}` : "/customers";
      const data = await api<Customer[]>(path);
      setList(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load(q);
  }, [load, q]));

  const filteredList = list.filter(item => {
    if (!selectedBranchId) return true;
    return item.branch_id === selectedBranchId;
  });

  return (
    <View style={styles.safe}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Customers</Text>
          <Text style={styles.subtitle}>{filteredList.length} total</Text>
        </View>
        <TouchableOpacity
          testID="add-customer-button"
          style={styles.addBtn}
          onPress={() => router.push("/customer-form")}
        >
          <MaterialCommunityIcons name="plus" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <MaterialCommunityIcons name="magnify" size={20} color={colors.textMuted} />
        <TextInput
          testID="customer-search-input"
          style={styles.searchInput}
          placeholder="Search by name, mobile or code..."
          placeholderTextColor={colors.textLight}
          value={q}
          onChangeText={setQ}
          returnKeyType="search"
          onSubmitEditing={() => load(q)}
        />
        {q ? (
          <TouchableOpacity onPress={() => { setQ(""); load(""); }}>
            <MaterialCommunityIcons name="close-circle" size={18} color={colors.textLight} />
          </TouchableOpacity>
        ) : null}
      </View>



      {loading ? (
        <View style={{ paddingVertical: 40, alignItems: "center" }}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={filteredList}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120, gap: spacing.md }}
          ListEmptyComponent={() => (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="account-search-outline" size={48} color={colors.textLight} />
              <Text style={styles.emptyText}>No customers yet</Text>
              <Text style={styles.emptySub}>Tap + to add your first customer</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`customer-${item.id}`}
              style={styles.item}
              onPress={() => router.push(`/customer/${item.id}`)}
              activeOpacity={0.85}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(item.name || "?").slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <View style={styles.codeChip}><Text style={styles.codeText}>{item.code}</Text></View>
                </View>
                <View style={styles.metaRow}>
                  <MaterialCommunityIcons name="phone" size={12} color={colors.textMuted} />
                  <Text style={styles.meta}>{item.mobile}</Text>
                  {item.village ? (
                    <>
                      <View style={styles.metaDot} />
                      <MaterialCommunityIcons name="map-marker" size={12} color={colors.textMuted} />
                      <Text style={styles.meta} numberOfLines={1}>{item.village}</Text>
                    </>
                  ) : null}
                  {item.branch_name && item.branch_name !== "-" ? (
                    <>
                      <View style={styles.metaDot} />
                      <MaterialCommunityIcons name="storefront" size={12} color={colors.primary} />
                      <Text style={[styles.meta, { color: colors.primary, fontWeight: "700" }]} numberOfLines={1}>
                        {item.branch_name}
                      </Text>
                    </>
                  ) : null}
                </View>
                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <MaterialCommunityIcons name="history" size={12} color={colors.textMuted} />
                    <Text style={styles.statText}>{item.total_arrivals || 0} arrivals</Text>
                  </View>
                  <View style={styles.statItem}>
                    <MaterialCommunityIcons name="cash" size={12} color={colors.textMuted} />
                    <Text style={styles.statText}>₹{(item.total_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                  </View>
                  <View style={styles.statItem}>
                    <MaterialCommunityIcons name="cash-check" size={12} color={colors.primary} />
                    <Text style={[styles.statText, { color: colors.primary, fontWeight: "700" }]}>₹{(item.amount_received || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                  </View>
                </View>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textLight} />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.xl, paddingBottom: spacing.md },
  title: { fontSize: 26, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  addBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", ...shadow.fab },
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    marginHorizontal: spacing.xl, backgroundColor: colors.card,
    borderRadius: radius.lg, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: colors.text },
  item: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, padding: spacing.md, borderRadius: radius.xl, gap: spacing.md, ...shadow.card },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary50, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 18, fontWeight: "800", color: colors.primary },
  name: { fontSize: 15, fontWeight: "700", color: colors.text },
  codeChip: { paddingHorizontal: 6, paddingVertical: 2, backgroundColor: colors.accent + "20", borderRadius: 6 },
  codeText: { fontSize: 10, fontWeight: "800", color: colors.accent, letterSpacing: 0.3 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  meta: { fontSize: 12, color: colors.textMuted, fontWeight: "500" },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.textLight, marginHorizontal: 4 },
  statsRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 },
  statItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  statText: { fontSize: 11, fontWeight: "600", color: colors.textMuted },
  empty: { alignItems: "center", paddingVertical: 60, gap: 6 },
  emptyText: { fontSize: 16, color: colors.text, fontWeight: "700", marginTop: 12 },
  emptySub: { fontSize: 13, color: colors.textMuted },
  filterContainer: { marginTop: spacing.md },
  chipsScroll: { paddingHorizontal: spacing.xl, gap: spacing.sm, paddingBottom: 2 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
  },
  chipTextSelected: {
    color: "#FFFFFF",
  },
});
