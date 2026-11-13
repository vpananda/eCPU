import React, { useEffect, useRef, useState } from "react";
import { View, Animated, StyleSheet, ViewStyle, Easing, Image } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

// Static relative path required by Metro bundler for native mobile assets
const LOGO_IMG = require("../../assets/images/e3logo.png");

interface LoaderProps {
  size?: number;
  showRing?: boolean;
  style?: ViewStyle;
}

export default function Loader({ size = 64, showRing = true, style }: LoaderProps) {
  const [imgError, setImgError] = useState(false);
  const pulseValue = useRef(new Animated.Value(0.95)).current;
  const spinValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 1. Gentle rhythmic breathing pulse
    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseValue, {
          toValue: 1.05,
          duration: 1300,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseValue, {
          toValue: 0.95,
          duration: 1300,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    // 2. Continuous orbital spinning ring
    const spinAnim = Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1600,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    pulseAnim.start();
    spinAnim.start();

    return () => {
      pulseAnim.stop();
      spinAnim.stop();
    };
  }, [pulseValue, spinValue]);

  const spinInterpolate = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const ringSize = size + 18;
  const logoSize = Math.round(size * 0.72);

  return (
    <View style={[styles.container, style]} testID="logo-loader">
      <View style={{ width: ringSize, height: ringSize, alignItems: "center", justifyContent: "center" }}>
        {/* Elegant Orbital Spinning Arc */}
        {showRing && (
          <Animated.View
            style={[
              styles.orbitalRing,
              {
                width: ringSize,
                height: ringSize,
                borderRadius: ringSize / 2,
                transform: [{ rotate: spinInterpolate }],
              },
            ]}
          />
        )}

        {/* Central Logo Pod with breathing pulse & soft elevation */}
        <Animated.View
          style={[
            styles.logoPod,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              transform: [{ scale: pulseValue }],
            },
          ]}
        >
          {!imgError ? (
            <Image
              source={LOGO_IMG}
              style={{
                width: logoSize,
                height: logoSize,
              }}
              resizeMode="contain"
              onError={() => setImgError(true)}
            />
          ) : (
            <MaterialCommunityIcons name="leaf" size={Math.round(size * 0.46)} color="#15803D" />
          )}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
    padding: 10,
  },
  orbitalRing: {
    position: "absolute",
    borderWidth: 2.5,
    borderColor: "rgba(16, 185, 129, 0.18)",
    borderTopColor: "#10B981",
    borderRightColor: "#059669",
  },
  logoPod: {
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 4,
  },
});
