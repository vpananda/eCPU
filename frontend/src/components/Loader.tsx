import React, { useEffect, useRef } from "react";
import { View, Animated, StyleSheet, ViewStyle } from "react-native";

interface LoaderProps {
  size?: number;
  style?: ViewStyle;
}

export default function Loader({ size = 60, style }: LoaderProps) {
  const pulseValue = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    // Gentle breathing pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseValue, {
          toValue: 1.1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseValue, {
          toValue: 0.9,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulseValue]);

  return (
    <View style={[styles.container, style]} testID="logo-loader">
      <Animated.Image
        source={require("@/assets/images/loader.png")}
        style={{
          width: size,
          height: size,
          resizeMode: "contain",
          transform: [{ scale: pulseValue }],
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
});
