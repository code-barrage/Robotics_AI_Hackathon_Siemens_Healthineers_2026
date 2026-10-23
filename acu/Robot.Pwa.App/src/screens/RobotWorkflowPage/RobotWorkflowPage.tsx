import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import Button from "../../components/Button";
import { destinationProgress, destinationReachedCount, nextScreenIndex,
  type DestinationProgress, type WorkflowPresentation } from "../../features/workflows/model/workflowPresentation";
import WorkflowScreen from "./WorkflowScreen";
import { useWorkflowStyles } from "./WorkflowScreen.styles";
import { reportUserError } from "../../api/userError";

export default function RobotWorkflowPage({ run, acuUrl, completing, onComplete, onProgress }: {
  run: WorkflowPresentation; acuUrl: string; completing: boolean;
  onComplete: (run: WorkflowPresentation) => Promise<void>;
  onProgress?: (progress: DestinationProgress | null) => void;
}) {
  const { styles: workflowScreenStyles } = useWorkflowStyles();
  const [index, setIndex] = useState(0);
  const [reached, setReached] = useState(0);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const steps = run.workflow.Steps;
  const step = steps[index];

  useEffect(() => {
    onProgress?.(step && step.ScreenId !== "Destinations" ? destinationProgress(steps, reached) : null);
  }, [onProgress, step, reached, steps]);

  useEffect(() => () => onProgress?.(null), [onProgress]);

  const finish = useCallback(async () => {
    setCompletionError(null);
    try {
      await onComplete(run);
    } catch (cause) {
      setCompletionError(reportUserError(cause, "acu"));
    }
  }, [onComplete, run]);

  useEffect(() => {
    if (index === steps.length) void finish();
  }, [index, steps.length, finish]);

  return <View style={workflowScreenStyles.page} testID="robot-workflow-page">
    {step ? <WorkflowScreen key={`${index}:${step.StepId}`} step={step} steps={steps} index={index} acuUrl={acuUrl}
      onDestinationReached={(name) => setReached((current) => destinationReachedCount(steps, index, name, current))}
      onAction={(action) => setIndex((current) =>
        current === index ? nextScreenIndex(current, action, steps.length) : current)} /> :
      <View style={workflowScreenStyles.center}>
        <Text style={workflowScreenStyles.message}>{completing ? "Saving workflow completion..." : "Workflow complete."}</Text>
        {completionError && <>
          <Text accessibilityRole="alert" style={[workflowScreenStyles.message, workflowScreenStyles.error]}>{completionError}</Text>
          <Button label="Retry completion" disabled={completing} onPress={() => { void finish(); }} />
        </>}
      </View>}
  </View>;
}
