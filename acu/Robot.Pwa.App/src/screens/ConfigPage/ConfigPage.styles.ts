import { Platform, StyleSheet } from "react-native";
import { BorderWidth, Size, Spacing, Typography, type Palette } from "../../theme";

export const createStyles = (colors: Palette) => StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  card: {
    margin: Spacing.md,
    padding: Spacing.md,
  },
  heading: {
    color: colors.text,
    ...Typography.heading,
    marginBottom: Spacing.xs,
  },
  hint: {
    ...Typography.body,
    color: colors.muted,
    marginBottom: Spacing.md,
  },
  label: {
    color: colors.text,
    ...Typography.label,
    marginTop: 12,
    marginBottom: Spacing.xs,
  },
  input: {
    position: "relative",
    zIndex: 1,
    minHeight: Size.inputHeight,
    color: colors.text,
    backgroundColor: "transparent",
    borderWidth: 0,
    borderBottomWidth: BorderWidth.thin,
    borderBottomColor: colors.fieldBorder,
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: Platform.OS === "ios" ? Size.inputPadding : Spacing.sm,
    ...Typography.input,
  },
  ok: {
    ...Typography.validation,
    color: colors.success,
  },
  error: {
    ...Typography.roman,
    color: colors.error,
    marginTop: 12,
  },
  button: {
    marginTop: 20,
  },
});
