import { ActivityIndicator, Pressable, Text, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../../theme";
import { createStyles } from "./Button.styles";

type Props = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "outline" | "text";
  disabled?: boolean;
  loading?: boolean;
  icon?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export default function Button({ label, onPress, variant = "primary", disabled, loading, icon, testID, accessibilityLabel, style }: Props) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const outline = variant === "outline";
  const textOnly = variant === "text";
  const inactive = Boolean(disabled || loading);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={inactive}
      accessibilityState={{ disabled: inactive, busy: Boolean(loading) }}
      aria-busy={Boolean(loading)}
      onPress={onPress}
      style={({ pressed }) => [
        style, styles.base, outline ? styles.outline : styles.primary,
        icon && styles.icon,
        textOnly && styles.text,
        inactive ? styles.disabled : pressed && styles.pressed,
      ]}
    >
      <Text style={[
        outline ? styles.outlineText : styles.primaryText, textOnly && styles.textLabel,
        icon && styles.iconText, loading && styles.loadingLabel,
      ]}>{label}</Text>
      {loading && <ActivityIndicator style={styles.loadingIndicator} color={outline ? colors.brand : colors.white} />}
    </Pressable>
  );
}