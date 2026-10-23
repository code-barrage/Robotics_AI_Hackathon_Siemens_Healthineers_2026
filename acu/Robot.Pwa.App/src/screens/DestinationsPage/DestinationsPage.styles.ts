import { StyleSheet } from "react-native";
import { Spacing, Typography, type Palette } from "../../theme";

export const createStyles = (colors: Palette) => StyleSheet.create({
  error: {
    ...Typography.roman,
    color: colors.error,
    margin: Spacing.md,
    textAlign: "center",
  },
  destinationsScreen: {
    width: "100%",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  destinationsGrid: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignContent: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
});
