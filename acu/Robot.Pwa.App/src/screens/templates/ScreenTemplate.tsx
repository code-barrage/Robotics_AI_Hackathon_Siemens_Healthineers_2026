import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import Button from "../../components/Button";
import {
  fillPlaceholderText, fillPlaceholders, getScreenMedia,
  type WorkflowButton, type WorkflowButtons, type WorkflowScreen,
} from "../../features/workflows/model/workflowPresentation";
import { resolveWorkflowMedia } from "../../features/workflows/model/workflowMediaSource";
import WorkflowMedia from "../RobotWorkflowPage/WorkflowMedia";
import { useWorkflowStyles } from "../RobotWorkflowPage/WorkflowScreen.styles";
import { reportUserError } from "../../api/userError";

/** Props every screen template receives from the workflow player. */
export type TemplateProps = {
  step: WorkflowScreen;
  steps: WorkflowScreen[];
  index: number;
  acuUrl: string;
  onAction: (action: WorkflowButton["Action"]) => void;
  onDestinationReached?: (destination: string) => void;
  visualMediaPresented?: boolean;
  onReplayVideo?: () => void;
};

/**
 * Parent of all workflow screen templates. Slots, top to bottom:
 * title (from the workflow) → template dialogue → media → template content → buttons.
 * The workflow progress bar lives in the app header. Child templates only supply their own
 * `dialogue` (and optional `children`).
 */
export default function ScreenTemplate({ step, index, acuUrl, onAction, dialogue, patientName, children, testID, fill, actionsDisabled, hidePresentation, visualMediaPresented, onReplayVideo }:
  TemplateProps & {
    dialogue?: string; patientName?: string; children?: ReactNode; testID?: string;
    /** Compact title/dialogue and spacing for screens with destination content. */
    fill?: boolean;
    actionsDisabled?: boolean;
    hidePresentation?: boolean;
  }) {
  const { styles } = useWorkflowStyles();
  const media = hidePresentation ? [] : getScreenMedia(step);
  return <ScrollView testID={testID ?? "workflow-screen"} contentContainerStyle={styles.content}>
    <View testID="workflow-content" style={fill ? styles.fillCenter : styles.contentGroup}>
      {!hidePresentation && step.Title?.trim() && <Text testID="workflow-title" style={[styles.title, fill ? styles.compactTitle : styles.screenTitle]}>{fillPlaceholderText(step.Title, step)}</Text>}
      {!hidePresentation && dialogue && <Text testID="workflow-dialogue" style={[styles.subtitle, fill && styles.compactSubtitle]}>
        {fillPlaceholders(dialogue, step, patientName).map((part, i) =>
          <Text key={i} style={part.highlight ? styles.highlight : undefined}>{part.text}</Text>)}
      </Text>}
      {media.map((item, i) => {
        if (visualMediaPresented && item.kind !== "audio") {
          return item.Buttons
            ? <TemplateButtons key={i} buttons={item.Buttons} onAction={onAction} index={index} disabled={actionsDisabled} onReplayVideo={onReplayVideo} />
            : null;
        }
        let source: { uri: string; local: boolean };
        try {
          source = resolveWorkflowMedia(item.path, acuUrl);
        } catch (cause) {
          return <Text key={i} accessibilityRole="alert" style={[styles.message, styles.error]}>
            {reportUserError(cause, "media")}</Text>;
        }
        return <View key={i} style={styles.mediaGroup}>
          <WorkflowMedia kind={item.kind} uri={source.uri} local={source.local} />
          {item.Buttons && <TemplateButtons buttons={item.Buttons} onAction={onAction} index={index} disabled={actionsDisabled} onReplayVideo={onReplayVideo} />}
        </View>;
      })}
      {fill ? <View style={styles.fillBody}>{children}</View> : children}
      {!hidePresentation && step.Buttons && <TemplateButtons buttons={step.Buttons} onAction={onAction} index={index} disabled={actionsDisabled} onReplayVideo={onReplayVideo} />}
    </View>
  </ScrollView>;
}

function TemplateButtons({ buttons, onAction, index, disabled, onReplayVideo }: {
  buttons: WorkflowButtons; onAction: TemplateProps["onAction"]; index: number; disabled?: boolean;
  onReplayVideo?: () => void;
}) {
  const { styles } = useWorkflowStyles();
  return <View style={styles.buttons}>
    {(["Yes", "No"] as const).map((key) => {
      const button = buttons[key];
      if (!button.Label && !button.Action) return null;
      const replay = key === "No" ? onReplayVideo : undefined;
      return <Button key={key} testID={`workflow-button-${key.toLowerCase()}`}
        disabled={disabled || (!replay && button.Action === "Previous" && index === 0)} label={button.Label || key}
        onPress={replay ?? (() => onAction(button.Action))} />;
    })}
  </View>;
}
