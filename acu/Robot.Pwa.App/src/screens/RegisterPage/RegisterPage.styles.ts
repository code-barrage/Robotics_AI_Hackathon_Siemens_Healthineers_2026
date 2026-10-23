import { StyleSheet } from "react-native";
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
  waitingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  heading: {
    color: colors.text,
    ...Typography.heading,
    marginBottom: Spacing.xs,
  },
  hint: {
    ...Typography.body,
    color: colors.muted,
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
    paddingVertical: Spacing.sm,
    ...Typography.input,
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
