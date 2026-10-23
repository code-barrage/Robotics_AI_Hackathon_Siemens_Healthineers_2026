import { useMemo, useRef, useState } from "react";
import { Modal, Text, View } from "react-native";
import Button from "../../components/Button";
import { reportUserError } from "../../api/userError";
import { getScreenMedia, type WorkflowScreen } from "../../features/workflows/model/workflowPresentation";
import { resolveWorkflowMedia } from "../../features/workflows/model/workflowMediaSource";
import WorkflowMedia from "./WorkflowMedia";
import { useWorkflowStyles } from "./WorkflowScreen.styles";

export default function WorkflowMediaIntroduction({ step, acuUrl, onComplete }: {
  step: WorkflowScreen; acuUrl: string; onComplete: () => void;
}) {
  const { styles } = useWorkflowStyles();
  const items = getScreenMedia(step).filter((item) => item.kind !== "audio");
  const [index, setIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const advanced = useRef(-1);
  const item = items[index];
  const source = useMemo(() => {
    try {
      return { ...resolveWorkflowMedia(item.path, acuUrl), error: null };
    } catch (cause) {
      return { uri: "", local: false, error: reportUserError(cause, "media") };
    }
  }, [item.path, acuUrl]);

  function next() {
    if (advanced.current === index || error || source.error) return;
    advanced.current = index;
    if (index + 1 < items.length) {
      setError(null);
      setIndex(index + 1);
    } else onComplete();
  }

  return <Modal visible presentationStyle="fullScreen" statusBarTranslucent
    navigationBarTranslucent onRequestClose={() => {}}>
    <View testID="workflow-immersive-media" style={styles.immersiveMedia}>
      <View style={styles.immersiveContent}>
        {!source.error && !error && <WorkflowMedia key={`${index}:${attempt}`}
          kind={item.kind} uri={source.uri} local={source.local} immersive
          onEnded={next}
          onError={(message) => {
            console.warn("Workflow introductory media failed", { path: item.path, message });
            setError(message);
          }} />}
        {(source.error || error) && <View style={styles.center}>
          <Text accessibilityRole="alert" style={[styles.message, styles.error]}>{source.error || error}</Text>
          {!source.error && <Button label="Retry media" onPress={() => {
            setError(null);
            setAttempt((value) => value + 1);
          }} />}
        </View>}
      </View>
      {item.kind === "image" && !source.error && !error && <View style={styles.immersiveActions}>
        <Button testID="workflow-media-next" label="Next" onPress={next} />
      </View>}
    </View>
  </Modal>;
}
