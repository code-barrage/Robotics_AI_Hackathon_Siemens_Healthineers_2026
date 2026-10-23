import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { Size, Spacing, Typography, useTheme, type Palette } from "../../theme";

/** Styles shared by the workflow player, screen templates and Start page; colours follow the light/dark theme. */
export const createWorkflowStyles = (colors: Palette) => StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: "center", alignItems: "center",
    paddingHorizontal: "5%", paddingVertical: Spacing.lg },
  contentGroup: { width: "100%", alignItems: "center", gap: Spacing.xxl },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 46, paddingVertical: 30 },
  title: { ...Typography.workflowTitle, color: colors.text, textAlign: "center" },
  screenTitle: Typography.workflowScreenTitle,
  compactTitle: Typography.workflowCompactTitle,
  assignedTitle: Typography.workflowAssignedTitle,
  idleTitle: Typography.workflowIdleTitle,
  subtitle: { ...Typography.workflowSubtitle, color: colors.text, textAlign: "center", paddingVertical: 20 },
  compactSubtitle: { ...Typography.workflowCompactSubtitle, paddingVertical: 0 },
  fillCenter: { width: "100%", alignItems: "center", gap: Spacing.control },
  fillBody: { width: "100%", alignItems: "center" },
  highlight: { ...Typography.emphasis, color: colors.brand },
  buttons: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 90, width: "100%" },
  message: { ...Typography.workflowMessage, color: colors.text, textAlign: "center", padding: Spacing.md },
  error: { color: colors.error },
  media: { width: "100%", maxWidth: Size.mediaWidth, aspectRatio: 16 / 10 },
  mediaGroup: { width: "100%", alignItems: "center", gap: Spacing.lg },
  immersiveMedia: { flex: 1, backgroundColor: colors.black },
  immersiveContent: { flex: 1 },
  immersiveActions: { padding: Spacing.lg, alignItems: "center" },
  immersiveFill: { width: "100%", height: "100%" },
  subtitleFooter: { flexGrow: 0, flexShrink: 1, maxHeight: "25%" },
  subtitleFooterContent: { alignItems: "center", paddingHorizontal: "5%",
    paddingTop: Spacing.sm, paddingBottom: Spacing.lg, gap: Spacing.sm },
  subtitleText: { ...Typography.workflowCompactSubtitle, textAlign: "center", width: "100%",
    maxWidth: Size.mediaWidth, color: colors.text },
  speechError: { ...Typography.body, textAlign: "center", color: colors.error },
});

export function useWorkflowStyles() {
  const { colors } = useTheme();
  return useMemo(() => ({ colors, styles: createWorkflowStyles(colors) }), [colors]);
}