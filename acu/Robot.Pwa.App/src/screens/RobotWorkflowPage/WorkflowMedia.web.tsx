import { useEffect, useRef, useState } from "react";
import { Image, Text, View } from "react-native";
import type { WorkflowMediaProps } from "./WorkflowMedia";
import { useWorkflowStyles } from "./WorkflowScreen.styles";

export default function WorkflowMedia({ kind, uri, local, immersive, onEnded, onError }: WorkflowMediaProps) {
  const { colors, styles: workflowScreenStyles } = useWorkflowStyles();
  const [error, setError] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (local) {
      onError?.("This media is only available on the robot.");
      return;
    }
    if (immersive && kind === "video") {
      void video.current?.play().catch((cause: unknown) => {
        console.warn("Video autoplay was blocked; use the play control.", cause);
      });
    }
  }, [uri, local, immersive, kind]);
  function failed() {
    setError(true);
    onError?.("Could not load workflow media.");
  }
  if (local) return <Text accessibilityRole="alert" style={[workflowScreenStyles.message, workflowScreenStyles.error]}>
    This media is only available on the robot.
  </Text>;
  return <View style={immersive ? workflowScreenStyles.immersiveFill : workflowScreenStyles.media}>
    {kind === "image" ? <Image source={{ uri }} resizeMode="contain"
      style={immersive ? workflowScreenStyles.immersiveFill : workflowScreenStyles.media}
      accessibilityLabel="Workflow image" onError={failed} /> : kind === "video" ?
      <video ref={video} src={uri} controls autoPlay={immersive} playsInline preload="metadata" aria-label="Workflow video"
        onEnded={onEnded} onError={failed}
        style={{ width: "100%", height: "100%", objectFit: "contain", background: colors.black }} /> :
      <audio src={uri} controls preload="metadata" aria-label="Workflow audio"
        onError={failed} style={{ width: "100%", margin: "auto" }} />}
    {error && <Text accessibilityRole="alert" style={[workflowScreenStyles.message, workflowScreenStyles.error]}>
      Could not load workflow media.
    </Text>}
  </View>;
}
