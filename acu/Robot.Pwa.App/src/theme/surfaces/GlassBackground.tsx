import { StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../provider";

export function GlassBackground() {
  const { colors } = useTheme();
  return <LinearGradient colors={[colors.raised, colors.surface]}
    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
    style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]} />;
}