import { Text, View } from "react-native";
import Button from "../../components/Button";
import type { WorkflowPresentation } from "../../features/workflows/model/workflowPresentation";
import { useWorkflowStyles } from "../RobotWorkflowPage/WorkflowScreen.styles";

/** Idle page after registration: "yet to be assigned" until ACU assigns a workflow, then a Start button. */
export default function StartPage({ assigned, starting, onStart }: {
  assigned: WorkflowPresentation | null; starting: boolean; onStart: () => void;
}) {
  const { styles } = useWorkflowStyles();
  return <View testID="start-page" style={[styles.page, styles.center]}>
    {assigned ? <>
      <Text testID="workflow-assigned-name" style={[styles.title, styles.assignedTitle]}>Assigned workflow: {assigned.workflow.WorkflowName}</Text>
      <Button testID="workflow-start" accessibilityLabel="Start workflow" label="Start"
        loading={starting} onPress={onStart} />
    </> : <Text testID="workflow-unassigned" style={[styles.title, styles.idleTitle]}>Welcome</Text>}
  </View>;
}