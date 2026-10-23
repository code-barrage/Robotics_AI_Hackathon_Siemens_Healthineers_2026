import { StyleSheet } from "react-native";
import { BorderWidth, Spacing, Radius, Typography, type Palette } from "../../theme";

export const createStyles = (colors: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: Spacing.md },
    title: { ...Typography.title, color: colors.text },
    body: { padding: Spacing.md, paddingTop: 0, gap: 12 },
    card: { borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, padding: 14, gap: 10 },
    row: { flexDirection: "row", alignItems: "center", gap: 10 },
    cardTitle: { ...Typography.cardTitle, color: colors.text },
    muted: { ...Typography.small, color: colors.muted },
    api: { ...Typography.captionCode, color: colors.muted },
    badge: { borderWidth: BorderWidth.thin, borderRadius: Radius.full,
      paddingHorizontal: Spacing.compact, paddingVertical: Spacing.xs },
    badgeText: Typography.badge,
    layerRow: { flexDirection: "row", gap: Spacing.sm },
    preview: {
      height: 180,
      borderRadius: Radius.sm,
      backgroundColor: colors.black,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    previewImage: { width: "100%", height: "100%" },
    previewText: { ...Typography.body, color: colors.previewMuted },
    liveDot: { position: "absolute", top: 10, right: 10, width: 10, height: 10, borderRadius: 5 },
    statsRow: { flexDirection: "row", justifyContent: "space-between" },
    stat: { alignItems: "center", flex: 1 },
    statValue: { ...Typography.stat, color: colors.text },
    statLabel: { ...Typography.caption, color: colors.muted },
    logLine: { ...Typography.smallCode, color: colors.text },
  });
