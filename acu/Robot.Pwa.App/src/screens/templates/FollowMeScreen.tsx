import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import Button from "../../components/Button";
import { useRobotSync } from "../../features/destinations/hooks/useDestinations";
import { moveAndWait, runFollowRoute } from "../../features/workflows/services/followRoute";
import { RobotArrival } from "../../platform/robot/robotArrival";
import { useWorkflowStyles } from "../RobotWorkflowPage/WorkflowScreen.styles";
import type { TemplateProps } from "./ScreenTemplate";
import { reportUserError } from "../../api/userError";

export default function FollowMeScreen(props: TemplateProps) {
  const sync = useRobotSync();
  const { styles } = useWorkflowStyles();
  const latest = useRef({ sync, onAction: props.onAction, onDestinationReached: props.onDestinationReached });
  latest.current = { sync, onAction: props.onAction, onDestinationReached: props.onDestinationReached };
  const position = useRef(sync.currentDestination);
  const [error, setError] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [lastCallback, setLastCallback] = useState<string | null>(null);
  const start = props.step.StartDestinationName;
  const next = props.step.NextDestinationName;

  // On-screen diagnostic (no adb on the robot): shows every arrival callback the vendor app sends.
  useEffect(() => {
    try {
      const subscription = RobotArrival.addListener("arrival", ({ tableNum }) => setLastCallback(tableNum));
      return () => subscription.remove();
    } catch (cause) {
      console.warn("Robot arrival diagnostics unavailable", cause);
      return undefined;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setError(null);
    const report = (event: string) => {
      void latest.current.sync.report(event).catch((cause: unknown) => {
        if (!signal.aborted)
          setReportError(reportUserError(cause, "acu"));
      });
    };
    const move = async (destination: string) => {
      position.current = null;
      latest.current.sync.recordArrival(null);
      await moveAndWait(RobotArrival, destination, signal, () => report(`navigating_to_${destination}`));
    };
    void runFollowRoute({
      start, next, signal, current: () => position.current, move,
      onPhase: () => {},
      onArrived: (destination) => {
        position.current = destination;
        latest.current.sync.recordArrival(destination);
        latest.current.onDestinationReached?.(destination);
        report(`arrived_at_${destination}`);
      },
    }).then(() => {
      if (!signal.aborted) {
        if (next) latest.current.onDestinationReached?.(next);
        latest.current.onAction("Next");
      }
    }).catch((cause: unknown) => {
      if (!signal.aborted)
        setError(reportUserError(cause, "movement"));
    });
    return () => controller.abort();
  }, [start, next, attempt]);

  return <ScrollView testID="workflow-follow-me-screen" contentContainerStyle={styles.content}>
    <View testID="workflow-content" style={styles.contentGroup}>
    {error && <Text testID="follow-last-callback" style={styles.message}>
      {`Last robot arrival signal: ${lastCallback === null ? "none yet" : `"${lastCallback}"`}`}
    </Text>}
    {reportError && <Text accessibilityRole="alert" style={[styles.message, styles.error]}>{reportError}</Text>}
    {error ? <>
      <Text accessibilityRole="alert" style={[styles.message, styles.error]}>{error}</Text>
      <Button label="Retry movement" onPress={() => setAttempt((value) => value + 1)} />
    </> : null}
    </View>
  </ScrollView>;
}
