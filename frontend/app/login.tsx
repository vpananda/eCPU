import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Image, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import { Input } from "@/src/components/Input";
import { Button } from "@/src/components/Button";
import { colors, radius, spacing } from "@/src/theme";
import { storage } from "@/src/utils/storage";

const LOGO = require("../assets/images/e3logo.png");

export default function LoginScreen() {
  const { login, loginWithGoogle } = useAuth();
  const toast = useToast();
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [gLoading, setGLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    (async () => {
      const savedMobile = await storage.getItem<string>("ethree_saved_mobile", "");
      const savedPassword = await storage.getItem<string>("ethree_saved_password", "");
      if (savedMobile) setMobile(savedMobile);
      if (savedPassword) setPassword(savedPassword);
    })();
  }, []);

  const onLogin = async () => {
    if (!mobile || !password) {
      toast.show("Enter mobile and password", "error");
      return;
    }
    setLoading(true);
    try {
      await login(mobile.trim(), password);
      await storage.setItem("ethree_saved_mobile", mobile.trim());
      await storage.setItem("ethree_saved_password", password);
      toast.show("Welcome back!");
    } catch (e: any) {
      toast.show(e.message || "Login failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const onGoogleLogin = async () => {
    setGLoading(true);
    try {
      await loginWithGoogle();
      // Web: page navigates away; the state update happens on remount
    } catch (e: any) {
      toast.show(e.message || "Google sign-in failed", "error");
    } finally {
      setGLoading(false);
    }
  };



  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={styles.logoWrap}>
              <Image source={LOGO} style={styles.logoImg} resizeMode="contain" />
            </View>
            <Text style={styles.tag}>Energy, Efficient, Environment</Text>
            <View style={styles.subTagRow}>
              <View style={styles.subTagLine} />
              <Text style={styles.subTag}>Post Harvest Processing Unit</Text>
              <View style={styles.subTagLine} />
            </View>
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

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              testID="google-signin-button"
              style={styles.googleBtn}
              onPress={onGoogleLogin}
              disabled={gLoading}
              activeOpacity={0.85}
            >
              <View style={styles.googleIcon}>
                <Text style={styles.googleG}>G</Text>
              </View>
              <Text style={styles.googleText}>
                {gLoading ? "Opening Google…" : "Continue with Google"}
              </Text>
            </TouchableOpacity>
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
  brand: {
    fontFamily: "Poppins-Black",
    fontSize: 72,
    color: colors.primary,
    letterSpacing: -4,
    marginTop: 6,
    lineHeight: 78,
  },
  tag: {
    fontFamily: "Poppins-SemiBold",
    fontSize: 13,
    color: colors.primary,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginTop: 2,
  },
  subTagRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    gap: 8,
  },
  subTagLine: { flex: 1, maxWidth: 32, height: 1, backgroundColor: colors.primaryLight },
  subTag: {
    fontFamily: "Poppins-SemiBold",
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
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
  divider: { flexDirection: "row", alignItems: "center", marginVertical: spacing.lg, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { fontSize: 11, fontWeight: "800", color: colors.textLight, letterSpacing: 0.5 },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 12,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  googleIcon: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "#fff",
    borderWidth: 1.5, borderColor: "#4285F4",
    alignItems: "center", justifyContent: "center",
  },
  googleG: { color: "#4285F4", fontWeight: "900", fontSize: 14, lineHeight: 16 },
  googleText: { fontSize: 15, fontWeight: "700", color: colors.text },
});
