import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { StatusPill } from "@/src/components/ui";

export default function SearchScreen() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ customers: any[]; batches: any[] }>({ customers: [], batches: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q.trim()) { setRes({ customers: [], batches: [] }); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api<any>(`/search?q=${encodeURIComponent(q.trim())}`);
        setRes(r);
      } finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="search-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.searchWrap}>
          <MaterialCommunityIcons name="magnify" size={20} color={colors.textMuted} />
          <TextInput
            testID="global-search-input"
            style={styles.input}
            placeholder="Customer, mobile, batch, receipt..."
            placeholderTextColor={colors.textLight}
            value={q}
            onChangeText={setQ}
            autoFocus
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }}>
        {loading && <ActivityIndicator color={colors.primary} />}
        {!q.trim() && (
          <View style={styles.hint}>
            <MaterialCommunityIcons name="magnify" size={48} color={colors.textLight} />
            <Text style={styles.hintText}>Search across customers and batches</Text>
          </View>
        )}
        {q.trim() && !loading && res.customers.length === 0 && res.batches.length === 0 && (
          <Text style={styles.empty}>{`No results for "${q}"`}</Text>
        )}
        {res.customers.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Customers ({res.customers.length})</Text>
            {res.customers.map(c => (
              <TouchableOpacity key={c.id} testID={`search-customer-${c.id}`} style={styles.row} onPress={() => router.push(`/customer/${c.id}`)}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{c.name.slice(0, 1).toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{c.name}</Text>
                  <Text style={styles.meta}>{c.code} · {c.mobile}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textLight} />
              </TouchableOpacity>
            ))}
          </>
        )}
        {res.batches.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Batches ({res.batches.length})</Text>
            {res.batches.map(b => (
              <TouchableOpacity key={b.id} testID={`search-batch-${b.id}`} style={styles.row} onPress={() => router.push(`/batch/${b.id}`)}>
                <View style={styles.badge}><MaterialCommunityIcons name="package-variant" size={20} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={styles.name}>{b.batch_no}</Text>
                    <StatusPill status={b.status} />
                  </View>
                  <Text style={styles.meta}>Receipt: {b.receipt_no}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textLight} />
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.xl, paddingBottom: spacing.md },
  searchWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.card, borderRadius: radius.lg, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, paddingVertical: 12, fontSize: 14, color: colors.text },
  hint: { alignItems: "center", paddingVertical: 60, gap: 8 },
  hintText: { fontSize: 13, color: colors.textMuted, marginTop: 8 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: colors.textMuted, letterSpacing: 0.4, textTransform: "uppercase", marginTop: spacing.md, marginBottom: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, padding: spacing.md, borderRadius: radius.lg, gap: spacing.md, marginBottom: spacing.sm, ...shadow.card },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary50, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontWeight: "800", color: colors.primary },
  badge: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary50, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 15, fontWeight: "700", color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
