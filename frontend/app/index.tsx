import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Image, Animated, Easing, StatusBar, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import { colors, radius, spacing } from "@/src/theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";

const LOGO = require("../assets/images/e3logo.png");

export default function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Intro animation: Smooth fade in & slight scale up
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        useNativeDriver: false,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim, progressAnim]);

  // Route fallback if _layout RouteGuard has not triggered
  useEffect(() => {
    if (loading) return;
    const timer = setTimeout(() => {
      if (user) {
        router.replace("/(tabs)/dashboard");
      } else {
        router.replace("/login");
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [user, loading, router]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0B2B1B" />

      {/* Ambient background decoration */}
      <View style={styles.ambientCircleTop} />
      <View style={styles.ambientCircleBottom} />

      {/* Main Content */}
      <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
        {/* Logo Card with soft glowing border */}
        <View style={styles.logoCardWrapper}>
          <View style={styles.logoGlow} />
          <View style={styles.logoCard}>
            <Image source={LOGO} style={styles.logoImg} resizeMode="contain" />
          </View>
        </View>

        {/* Company Title */}
        <Text style={styles.brandTitle}>E3 AGRO SOLUTIONS</Text>

        {/* Primary Tagline */}
        <View style={styles.taglineRow}>
          <Text style={styles.taglineText}>ENERGY</Text>
          <View style={styles.taglineDot} />
          <Text style={styles.taglineText}>EFFICIENT</Text>
          <View style={styles.taglineDot} />
          <Text style={styles.taglineText}>ENVIRONMENT</Text>
        </View>

        {/* Subtitle Badge */}
        <View style={styles.badgePill}>
          <MaterialCommunityIcons name="leaf" size={13} color="#A7F3D0" style={{ marginRight: 5 }} />
          <Text style={styles.badgeText}>Post Harvest Processing Unit</Text>
        </View>

        {/* Progress Bar Container */}
        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressBar, { width: progressWidth }]} />
          </View>
          <Text style={styles.loadingText}>Initializing secure drying telemetry...</Text>
        </View>
      </Animated.View>

      {/* Professional Footer */}
      <View style={styles.footer}>
        <View style={styles.editionPill}>
          <MaterialCommunityIcons name="shield-check" size={12} color="#6EE7B7" style={{ marginRight: 4 }} />
          <Text style={styles.editionText}>Enterprise Cloud Edition</Text>
        </View>
        <Text style={styles.copyrightText}>E3 Smart Drying Plant Manager • v1.0</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B2B1B",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xxl || 48,
    paddingHorizontal: spacing.xl,
    position: "relative",
  },
  ambientCircleTop: {
    position: "absolute",
    width: 380,
    height: 380,
    borderRadius: 190,
    backgroundColor: "rgba(46, 125, 50, 0.22)",
    top: -120,
    right: -100,
  },
  ambientCircleBottom: {
    position: "absolute",
    width: 440,
    height: 440,
    borderRadius: 220,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    bottom: -160,
    left: -120,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  logoCardWrapper: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xl,
  },
  logoGlow: {
    position: "absolute",
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: "rgba(52, 211, 153, 0.25)",
  },
  logoCard: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3.5,
    borderColor: "#E8F5E9",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  logoImg: {
    width: 96,
    height: 96,
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: 1.5,
    textAlign: "center",
    marginBottom: 8,
  },
  taglineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: spacing.md,
  },
  taglineText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#A7F3D0",
    letterSpacing: 1.2,
  },
  taglineDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#34D399",
  },
  badgePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(16, 185, 129, 0.18)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(52, 211, 153, 0.35)",
    marginBottom: 40,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#D1FAE5",
    letterSpacing: 0.4,
  },
  progressContainer: {
    width: "72%",
    maxWidth: 260,
    alignItems: "center",
    marginTop: 10,
  },
  progressTrack: {
    width: "100%",
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#34D399",
    borderRadius: 2,
  },
  loadingText: {
    fontSize: 11,
    color: "rgba(209, 250, 229, 0.8)",
    marginTop: 10,
    fontWeight: "600",
    textAlign: "center",
  },
  footer: {
    alignItems: "center",
    gap: 6,
  },
  editionPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  editionText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#A7F3D0",
    letterSpacing: 0.4,
  },
  copyrightText: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.45)",
    fontWeight: "500",
  },
});
