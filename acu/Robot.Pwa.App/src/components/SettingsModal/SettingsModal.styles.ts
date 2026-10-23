import { StyleSheet } from "react-native";
import { BorderWidth, Size, Spacing, Typography, createButtonStyles, type Palette } from "../../theme";

export const createStyles = (colors: Palette) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", alignItems: "center", padding: Spacing.md, backgroundColor: colors.scrim },
  card: { width: "100%", maxWidth: Size.settingsWidth, maxHeight: "100%" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: BorderWidth.thin, borderBottomColor: colors.border },
  body: { flexShrink: 1 },
  bodyContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm },
  section: { gap: Spacing.control, paddingVertical: Spacing.md,
    borderBottomWidth: BorderWidth.thin, borderBottomColor: colors.border },
  sectionTitle: { ...Typography.cardTitle, color: colors.text },
  title: { ...Typography.title, color: colors.text },
  themeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  themeLabel: { ...Typography.body, color: colors.text },
  themeButton: {
    ...createButtonStyles(colors).base, flexDirection: "row", gap: Spacing.sm, backgroundColor: colors.input,
  },
  themeButtonText: createButtonStyles(colors).outlineText,
  toggleTrack: { width: 36, height: 20, borderRadius: 10, padding: 3 },
  toggleThumb: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.white },
  hint: { ...Typography.body, color: colors.muted },
  speechValue: { ...Typography.label, color: colors.text },
  speechDetails: { gap: Spacing.sm },
  speechSlider: { width: "100%", height: 44 },
  speechActions: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
});