import React, { useState } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Image, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import { Input } from "@/src/components/Input";
import { Button } from "@/src/components/Button";
import { colors, radius, spacing } from "@/src/theme";

const LOGO = require("../assets/images/e3logo.png");

const DEMO = [
  { role: "Admin", mobile: "9999999999", password: "admin123" },
  { role: "Manager", mobile: "8888888888", password: "manager123" },
  { role: "Store Incharge", mobile: "7777777777", password: "store123" },
];

export default function LoginScreen() {
  const { login } = useAuth();
  const toast = useToast();
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const onLogin = async () => {
    if (!mobile || !password) {
      toast.show("Enter mobile and password", "error");
      return;
    }
    setLoading(true);
    try {
      await login(mobile.trim(), password);
      toast.show("Welcome back!");
    } catch (e: any) {
      toast.show(e.message || "Login failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (m: string, p: string) => {
    setMobile(m);
    setPassword(p);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={styles.logoWrap}>
              <Image source={LOGO} style={styles.logoImg} resizeMode="contain" />
            </View>
            <Text style={styles.brand}>E3</Text>
            <Text style={styles.tag}>Energy · Efficient · Environment</Text>
            <Text style={styles.subTag}>Smart Drying Plant Management</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Sign in</Text>
            <Text style={styles.subtitle}>Manage your drying operations</Text>

            <View style={{ height: spacing.lg }} />

            <Input
              testID="login-mobile-input"
              label="Mobile Number"
              placeholder="Enter mobile number"
              keyboardType="phone-pad"
              value={mobile}
              onChangeText={setMobile}
              leftIcon={<MaterialCommunityIcons name="cellphone" size={18} color={colors.textMuted} />}
              maxLength={15}
            />

            <Input
              testID="login-password-input"
              label="Password"
              placeholder="Enter password"
              secureTextEntry={!showPw}
              value={password}
              onChangeText={setPassword}
              leftIcon={<MaterialCommunityIcons name="lock-outline" size={18} color={colors.textMuted} />}
            />

            <TouchableOpacity onPress={() => setShowPw(!showPw)} style={styles.showPw}>
              <MaterialCommunityIcons name={showPw ? "eye-off-outline" : "eye-outline"} size={16} color={colors.primary} />
              <Text style={styles.showPwText}>{showPw ? "Hide" : "Show"} password</Text>
            </TouchableOpacity>

            <Button testID="login-submit-button" title="Sign In" onPress={onLogin} loading={loading} />
          </View>

          <View style={styles.demoBox}>
            <Text style={styles.demoTitle}>Demo Accounts</Text>
            {DEMO.map(d => (
              <TouchableOpacity
                testID={`demo-${d.role.toLowerCase().replace(" ", "-")}-button`}
                key={d.mobile}
                style={styles.demoRow}
                onPress={() => fillDemo(d.mobile, d.password)}
              >
                <View style={styles.demoBadge}>
                  <MaterialCommunityIcons name="account-circle" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.demoRole}>{d.role}</Text>
                  <Text style={styles.demoMeta}>{d.mobile} · {d.password}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textLight} />
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  hero: { alignItems: "center", paddingVertical: spacing.xxl, gap: spacing.sm },
  logoWrap: {
    width: 108, height: 108, borderRadius: 32,
    backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center",
    marginBottom: spacing.sm,
    shadowColor: "#2E7D32", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 6,
  },
  logoImg: { width: 78, height: 78 },
  brand: { fontSize: 44, fontWeight: "900", color: colors.primary, letterSpacing: -1.5, marginTop: 2 },
  tag: { fontSize: 13, color: colors.primary, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase" },
  subTag: { fontSize: 12, color: colors.textMuted, fontWeight: "500", marginTop: 2 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xxl,
    padding: spacing.xl,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 3,
  },
  title: { fontSize: 22, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  showPw: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-end", marginBottom: spacing.lg, marginTop: -4 },
  showPwText: { fontSize: 12, color: colors.primary, fontWeight: "600" },
  demoBox: { marginTop: spacing.xl, backgroundColor: colors.primary50, borderRadius: radius.xl, padding: spacing.lg },
  demoTitle: { fontSize: 12, fontWeight: "800", color: colors.primaryDark, letterSpacing: 0.5, marginBottom: spacing.md, textTransform: "uppercase" },
  demoRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: "#ffffff90" },
  demoBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  demoRole: { fontSize: 14, fontWeight: "700", color: colors.text },
  demoMeta: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
});
