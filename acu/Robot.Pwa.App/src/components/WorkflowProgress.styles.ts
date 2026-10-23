import { StyleSheet } from "react-native";
import { Size, Spacing, Typography } from "../theme";

export const styles = StyleSheet.create({
  root: { width: "100%" },
  viewport: { width: "100%", flexGrow: 0 },
  track: { flexDirection: "row", alignItems: "flex-start", paddingVertical: Spacing.xs },
  stop: { flexShrink: 0 },
  destination: { width: Size.progressLabelWidth, alignItems: "center", gap: Spacing.xs },
  label: { ...Typography.cardTitle, width: "100%", textAlign: "center" },
  line: { flexShrink: 0, height: Size.progressLine, borderRadius: Size.progressLine / 2 },
  connector: { position: "absolute", top: (Size.progressDot - Size.progressLine) / 2,
    left: (Size.progressLabelWidth + Size.progressDot) / 2 },
  dot: { width: Size.progressDot, height: Size.progressDot, borderRadius: Size.progressDot / 2,
    alignItems: "center", justifyContent: "center" },
  tick: Typography.routeTick,
  number: Typography.routeNumber,
});
