import { useFonts } from "expo-font";

export const useBrandFonts = (): readonly [boolean, Error | null] =>
  useFonts({
    "Poppins-Black": require("@/assets/fonts/Poppins-Black.ttf"),
    "Poppins-SemiBold": require("@/assets/fonts/Poppins-SemiBold.ttf"),
  });
