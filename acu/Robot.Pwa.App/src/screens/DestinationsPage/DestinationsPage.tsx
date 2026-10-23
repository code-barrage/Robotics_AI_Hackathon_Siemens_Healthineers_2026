import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import Button from "../../components/Button";

import { useRobotSync } from "../../features/destinations/hooks/useDestinations";
import { RobotArrival } from "../../platform/robot/robotArrival";
import { moveAndWait } from "../../features/workflows/services/followRoute";
import { useTheme } from "../../theme";
import { createStyles } from "./DestinationsPage.styles";
import { reportUserError } from "../../api/userError";

interface Props {
  onNavigatingChange?: (moving: boolean) => void;
  onArrived?: (destination: string) => void;
}

/** Destination picker body used by the Destinations workflow screen. Data comes from the app-level robot sync. */
export default function DestinationsPage({ onNavigatingChange, onArrived }: Props) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const sync = useRobotSync();
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const navigatingRef = useRef<string | null>(null);
  const movement = useRef<AbortController | null>(null);
  const error = actionError || sync.error;

  function navigate(name: string | null) {
    navigatingRef.current = name;
    setNavigatingTo(name);
    onNavigatingChange?.(name !== null);
  }

  function arrived(name: string) {
    if (navigatingRef.current !== name) return;
    navigate(null);
    sync.recordArrival(name);
    report(`arrived_at_${name}`);
    onArrived?.(name);
  }

  function report(event: string) {
    void sync.report(event).catch((cause: unknown) => {
      console.warn("ACU navigation event failed", cause);
      if (!movement.current?.signal.aborted)
        setActionError(reportUserError(cause, "acu"));
    });
  }

  useEffect(() => () => movement.current?.abort(), []);

  async function handleNavigate(name: string) {
    if (navigatingRef.current !== null) return;
    setActionError(null);
    if (Platform.OS !== "android") {
      setActionError("Movement is only available on the robot.");
      return;
    }
    const controller = new AbortController();
    movement.current = controller;
    sync.recordArrival(null);
    navigate(name);
    try {
      await moveAndWait(RobotArrival, name, controller.signal, () => report(`navigating_to_${name}`));
      if (!controller.signal.aborted) arrived(name);
    } catch (err) {
      if (controller.signal.aborted) return;
      navigate(null);
      setActionError(reportUserError(err, "movement"));
    }
  }

  if (navigatingTo) {
    return (
      <View testID="destination-movement" style={styles.destinationsScreen}>
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      </View>
    );
  }

  return (
    <View testID="destinations-screen" style={styles.destinationsScreen}>
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {sync.loading && sync.destinations.length === 0 && <ActivityIndicator color={colors.brand} />}
      <View testID="destinations-grid" style={styles.destinationsGrid}>
        {sync.destinations.map((destination) => (
          <Button
            key={destination.name}
            testID={`destination-${destination.name}`}
            label={destination.name}
            onPress={() => handleNavigate(destination.name)}
          />
        ))}
      </View>
    </View>
  );
}
