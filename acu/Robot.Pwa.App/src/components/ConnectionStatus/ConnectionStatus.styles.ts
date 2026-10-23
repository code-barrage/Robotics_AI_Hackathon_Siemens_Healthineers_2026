import { StyleSheet } from "react-native";
import { Spacing } from "../../theme";

export const createStyles = () => StyleSheet.create({
  container: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: Spacing.xs },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 8,
  },
});