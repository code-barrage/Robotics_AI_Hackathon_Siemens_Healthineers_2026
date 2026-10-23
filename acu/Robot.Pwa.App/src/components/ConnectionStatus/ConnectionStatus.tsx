import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import { useTheme } from "../../theme";
import { createStyles } from "./ConnectionStatus.styles";

export default function ConnectionStatus({ isOnline }: { isOnline: boolean }) {
  const { colors } = useTheme();
  const styles = createStyles();
  const pulse = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 750, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const color = isOnline ? colors.success : colors.error;
  return (
    <View testID="connection-status" accessibilityLabel={isOnline ? "Online" : "Offline"} style={styles.container}>
      <Animated.View
        testID="connection-status-dot"
        style={[
          styles.dot,
          {
            backgroundColor: color,
            shadowColor: color,
            opacity: pulse,
            transform: [{ scale: pulse.interpolate({ inputRange: [0.55, 1], outputRange: [0.85, 1.2] }) }],
          },
        ]}
      />
    </View>
  );
}