import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { templateFor, type TemplateProps } from "../templates";
import { PATIENT_NAME } from "../templates/PatientIdentificationScreen";
import { useRobotSync } from "../../features/destinations/hooks/useDestinations";
import { getScreenMedia, hasContentAfterMedia, stepSpeechText } from "../../features/workflows/model/workflowPresentation";
import { RobotTts } from "../../platform/robot/robotTts";
import { reportUserError } from "../../api/userError";
import { useWorkflowStyles } from "./WorkflowScreen.styles";
import WorkflowMediaIntroduction from "./WorkflowMediaIntroduction";

/** Renders the template registered for the step's ScreenId and speaks the step's TTS text. */
export default function WorkflowScreen(props: TemplateProps) {
  const Template = templateFor(props.step.ScreenId);
  const { speechLanguage } = useRobotSync();
  const { styles } = useWorkflowStyles();
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [mediaPresented, setMediaPresented] = useState(false);
  const hasVisualMedia = getScreenMedia(props.step).some((item) => item.kind !== "audio");
  const presentingMedia = hasVisualMedia && !mediaPresented;
  const text = stepSpeechText(props.step, PATIENT_NAME);

  useEffect(() => {
    setSpeechError(null);
    if (!text || presentingMedia) return;
    let active = true;
    RobotTts.speak(text, speechLanguage).catch((cause: unknown) => {
      if (active) setSpeechError(reportUserError(cause, "speech"));
    });
    return () => {
      active = false;
      void RobotTts.stop().catch(() => undefined);
    };
  }, [props.step.StepId, text, speechLanguage, presentingMedia]);

  if (presentingMedia) return <WorkflowMediaIntroduction step={props.step} acuUrl={props.acuUrl}
    onComplete={() => {
      if (hasContentAfterMedia(props.step)) setMediaPresented(true);
      else props.onAction("Next");
    }} />;

  return <View style={styles.page}>
    <View testID="workflow-body" style={styles.page}>
      <Template key={props.step.StepId} {...props} visualMediaPresented={mediaPresented}
        onReplayVideo={getScreenMedia(props.step).some((item) => item.kind === "video")
          ? () => setMediaPresented(false) : undefined} />
    </View>
    {(text || speechError) && <ScrollView testID="workflow-subtitles"
      style={styles.subtitleFooter} contentContainerStyle={styles.subtitleFooterContent}>
      {text && <Text testID="workflow-tts-text" style={styles.subtitleText}>{text}</Text>}
      {speechError && <Text testID="workflow-tts-error" accessibilityRole="alert" style={styles.speechError}>
        {speechError}
      </Text>}
    </ScrollView>}
  </View>;
}
