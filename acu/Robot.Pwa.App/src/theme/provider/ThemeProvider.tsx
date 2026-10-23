import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFonts } from "expo-font";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { palettes, type ThemeMode } from "../colors";
import { fonts } from "../fonts";
import { Spacing } from "../layout";

const STORAGE_KEY = "robotPwa.theme";

const ThemeContext = createContext({
  colors: palettes.dark, mode: "dark" as ThemeMode,
  setMode: (_mode: ThemeMode) => {}, error: null as string | null,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [fontsLoaded, fontError] = useFonts(fonts);
  const [mode, setModeState] = useState<ThemeMode>("dark");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (fontError) console.warn("Could not load app fonts", fontError);
  }, [fontError]);
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (value === "light" || value === "dark") setModeState(value);
    }).catch((cause: unknown) => {
      console.warn("Could not load theme", cause);
      setError("Could not load appearance settings.");
    });
  }, []);
  const setMode = (value: ThemeMode) => {
    setModeState(value);
    AsyncStorage.setItem(STORAGE_KEY, value)
      .catch((cause: unknown) => {
        console.warn("Could not save theme", cause);
        setError("Could not save appearance settings.");
      });
  };
  const colors = palettes[mode];
  if (fontError) return <View style={[styles.loading, { backgroundColor: colors.background }]}>
    <Text accessibilityRole="alert" style={{ color: colors.error }}>Could not load app fonts.</Text>
  </View>;
  if (!fontsLoaded) return <View testID="font-loading" style={[styles.loading, { backgroundColor: colors.background }]}>
    <ActivityIndicator color={colors.brand} accessibilityLabel="Loading app fonts" />
  </View>;
  return <ThemeContext.Provider value={{ colors, mode, setMode, error }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.lg },
});