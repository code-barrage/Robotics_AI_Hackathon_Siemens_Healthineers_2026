import { StyleSheet } from "react-native";
import { Size, Spacing, Typography, type Palette } from "./theme";

export const createStyles = (colors: Palette) => StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.background },
  shell: { flex: 1, width: "100%", maxWidth: Size.shellWidth, alignSelf: "center", padding: Spacing.md, gap: Spacing.md },
  fullShell: { maxWidth: "100%", padding: 0, gap: 0 },
  settingsBar: { height: 48, flexDirection: "row", justifyContent: "flex-end", alignItems: "center", paddingHorizontal: 12 },
  settingsButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", padding: 6 },
  settingsIcon: { ...Typography.icon, color: colors.muted },
  error: { ...Typography.roman, color: colors.error },
  main: { flex: 1 },
  debugShell: { flex: 1, backgroundColor: colors.background },
});