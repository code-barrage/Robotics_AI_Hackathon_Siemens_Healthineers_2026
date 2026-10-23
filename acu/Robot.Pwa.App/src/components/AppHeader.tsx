import { View } from "react-native";
import Button from "./Button";
import ConnectionStatus from "./ConnectionStatus";
import WorkflowProgress from "./WorkflowProgress";
import { useTheme } from "../theme";
import { styles } from "./AppHeader.styles";
import type { DestinationProgress } from "../features/workflows/model/workflowPresentation";

export default function AppHeader({ online, registered, onSettings, progress }: {
  online: boolean; registered: boolean; onSettings: () => void;
  progress?: DestinationProgress | null;
}) {
  const { colors } = useTheme();
  return <View testID="app-header" style={[styles.row, { backgroundColor: colors.background }]}>
    <View style={styles.middle}>
      {progress && progress.total > 0 && <WorkflowProgress progress={progress} />}
    </View>
    <Button testID="settings-button" label={"\u2699\uFE0E"} accessibilityLabel="Settings" icon variant="outline" onPress={onSettings} />
    {registered && <ConnectionStatus isOnline={online} />}
  </View>;
}
