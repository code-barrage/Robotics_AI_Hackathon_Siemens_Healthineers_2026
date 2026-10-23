import { StyleSheet } from "react-native";
import { Size, Spacing } from "../theme";

export const styles = StyleSheet.create({
  row: { minHeight: Size.headerHeight, flexDirection: "row", alignItems: "center",
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, gap: Spacing.sm },
  middle: { flex: 1, minWidth: 0, justifyContent: "center" },
});
