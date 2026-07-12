import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, StatusBar } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { useBrandFonts } from "@/src/hooks/use-brand-fonts";
import { AuthProvider, useAuth } from "@/src/auth";
import { ToastProvider } from "@/src/components/Toast";
import { colors } from "@/src/theme";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

function RouteGuard() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inTabs = segments[0] === "(tabs)";
    const onLogin = segments[0] === "login";
    if (!user && !onLogin) {
      router.replace("/login");
    } else if (user && (onLogin || segments.length === 0)) {
      router.replace("/(tabs)/dashboard");
    }
  }, [user, loading, segments, router]);

  return null;
}

export default function RootLayout() {
  const [iconsLoaded, iconError] = useIconFonts();
  const [brandLoaded, brandError] = useBrandFonts();
  const loaded = iconsLoaded && brandLoaded;
  const error = iconError || brandError;

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <AuthProvider>
        <ToastProvider>
          <RouteGuard />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
        </ToastProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
