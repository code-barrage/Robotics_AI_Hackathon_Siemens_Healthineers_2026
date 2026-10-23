import { Platform, type ViewStyle } from "react-native";
import type { Palette } from "../colors";
import { Radius } from "../layout";

export function glossySurface(colors: Palette): ViewStyle {
  return {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: colors.muted,
    borderRadius: Radius.xl,
    boxShadow: "0px 12px 32px rgba(0, 0, 0, 0.22)",
    overflow: "hidden",
    ...(Platform.OS === "web" ? { backdropFilter: "blur(18px)" } : {}),
  };
}