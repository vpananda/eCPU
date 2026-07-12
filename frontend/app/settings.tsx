import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, radius, shadow, spacing } from "@/src/theme";

export default function Settings() {
  const router = useRouter();
  const { user } = useAuth();
  const [company, setCompany] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      api<any>("/settings/company"),
      api<any[]>("/products"),
      api<any[]>("/machines"),
      api<any[]>("/branches"),
    ]).then(([c, p, m, b]) => {
      setCompany(c); setProducts(p); setMachines(m); setBranches(b);
    });
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="settings-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }}>
        <Section title="Company Information">
          <Row label="Name" value={company?.name || "-"} />
          <Row label="Default Rate" value={`₹${company?.default_rate || 0}/kg`} />
          <Row label="GST" value={company?.gst || "Not set"} />
        </Section>

        <Section title={`Branches (${branches.length})`}>
          {branches.map(b => (
            <Row key={b.id} label={b.name} value={b.address || "-"} />
          ))}
        </Section>

        <Section title={`Products (${products.length})`}>
          {products.map(p => (
            <Row key={p.id} label={p.name} value={`₹${p.default_rate}/kg`} />
          ))}
        </Section>

        <Section title={`Machines (${machines.length})`}>
          {machines.map(m => (
            <Row key={m.id} label={m.name} value={`${m.capacity}kg · ${m.status}`} />
          ))}
        </Section>

        <Section title="Account">
          <Row label="Name" value={user?.name || "-"} />
          <Row label="Mobile" value={user?.mobile || "-"} />
          <Row label="Role" value={user?.role || "-"} />
        </Section>

        <Text style={styles.footer}>E3 · Post Harvest Processing Unit · v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  section: { backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md, ...shadow.card },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: colors.textMuted, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: spacing.sm },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  rowLabel: { fontSize: 13, color: colors.textMuted, fontWeight: "500" },
  rowValue: { fontSize: 13, color: colors.text, fontWeight: "700", flexShrink: 1, textAlign: "right", marginLeft: 12 },
  footer: { textAlign: "center", fontSize: 11, color: colors.textLight, marginTop: spacing.lg },
});
