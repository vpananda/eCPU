import React from "react";
import { Tabs } from "expo-router";
import { View, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "@/src/theme";

const ICONS: Record<string, any> = {
  dashboard: "view-dashboard",
  customers: "account-group",
  "new-entry": "plus-circle",
  machines: "cog-outline",
  more: "dots-horizontal",
};

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700", marginTop: -2, marginBottom: 4 },
        tabBarStyle: {
          backgroundColor: "#fff",
          borderTopColor: colors.border,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom + 4,
          paddingTop: 6,
        },
        tabBarIcon: ({ color, focused }) => {
          const name = route.name === "new-entry" ? "plus" : ICONS[route.name] || "circle";
          if (route.name === "new-entry") {
            return (
              <View style={styles.newEntry}>
                <MaterialCommunityIcons name="plus" size={26} color="#fff" />
              </View>
            );
          }
          return <MaterialCommunityIcons name={ICONS[route.name] || "circle"} size={24} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="dashboard" options={{ title: "Home" }} />
      <Tabs.Screen name="customers" options={{ title: "Customers" }} />
      <Tabs.Screen name="new-entry" options={{ title: "" }} />
      <Tabs.Screen name="machines" options={{ title: "Machines" }} />
      <Tabs.Screen name="more" options={{ title: "More" }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  newEntry: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center",
    marginTop: Platform.OS === "ios" ? -6 : -10,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 8,
  },
});
