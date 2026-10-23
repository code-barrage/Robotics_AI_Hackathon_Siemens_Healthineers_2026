import { StyleSheet } from "react-native";
import type { Palette } from "../colors";
import { BorderWidth, Opacity, Radius, Size, Spacing } from "../layout";
import { Typography } from "../fonts";
 
export const buttonShape = {
  minWidth: 120,
  minHeight: Size.minTapTarget,
  maxWidth: "100%",
  alignSelf: "center",
  flexShrink: 1,
  borderRadius: Radius.full,
  paddingHorizontal: Spacing.md,
  paddingVertical: Spacing.control,
  alignItems: "center",
  justifyContent: "center",
} as const;
 
export const createButtonStyles = (colors: Palette) => StyleSheet.create({
  base: { ...buttonShape, borderWidth: BorderWidth.thin, borderColor: colors.brand },
  primary: { backgroundColor: colors.brand },
  outline: { backgroundColor: "transparent" },
  text: { minWidth: Size.minTapTarget, minHeight: Size.minTapTarget, borderWidth: 0,
    backgroundColor: "transparent", paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm },
  textLabel: { ...Typography.roman, color: colors.muted },
  icon: { minWidth: Size.minTapTarget, width: Size.minTapTarget, height: Size.minTapTarget,
    paddingHorizontal: 0, paddingVertical: 0, flexShrink: 0,
    borderWidth: BorderWidth.none, backgroundColor: "transparent" },
  iconText: { ...Typography.icon, color: colors.icon },
  primaryText: { ...Typography.button, maxWidth: "100%", color: colors.white, textAlign: "center" },
  outlineText: { ...Typography.button, maxWidth: "100%", color: colors.brand, textAlign: "center" },
  disabled: { opacity: Opacity.disabled },
  pressed: { opacity: Opacity.pressed },
  loadingLabel: { opacity: 0 },
  loadingIndicator: { position: "absolute" },
});