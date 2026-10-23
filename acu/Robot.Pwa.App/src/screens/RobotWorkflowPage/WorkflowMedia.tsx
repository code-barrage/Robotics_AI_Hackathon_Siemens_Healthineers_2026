import { useEffect, useState } from "react";
import { Image, PermissionsAndroid, Platform, Text, View } from "react-native";
import { useEvent, useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { useWorkflowStyles } from "./WorkflowScreen.styles";
import { reportUserError } from "../../api/userError";

export type WorkflowMediaProps = {
  kind: "image" | "video" | "audio";
  uri: string;
  local?: boolean;
  immersive?: boolean;
  onEnded?: () => void;
  onError?: (message: string) => void;
};

function NativeVideo({ uri, local, immersive, onEnded, onError }: WorkflowMediaProps) {
  const { styles: workflowScreenStyles } = useWorkflowStyles();
  const [ready, setReady] = useState(!local);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function authorize() {
      if (Platform.OS === "android" && local && /^file:\/\/\/(storage|sdcard|mnt)\//.test(uri)) {
        const permission = Number(Platform.Version) >= 33
          ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO
          : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
        const granted = await PermissionsAndroid.request(permission);
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) throw new Error("Permission to read robot video files was denied.");
      }
      if (!cancelled) setReady(true);
    }
    authorize().catch((cause) => {
      if (!cancelled) {
        const message = reportUserError(cause, "media");
        setPermissionError(message);
        onError?.(message);
      }
    });
    return () => { cancelled = true; };
  }, [uri, local]);
  return <View style={immersive ? workflowScreenStyles.immersiveFill : workflowScreenStyles.media}>
    {ready && <NativeVideoPlayer uri={uri} immersive={immersive} onEnded={onEnded} onError={onError} />}
    {permissionError && <Text accessibilityRole="alert" style={[workflowScreenStyles.message, workflowScreenStyles.error]}>{permissionError}</Text>}
  </View>;
}

function NativeVideoPlayer({ uri, immersive, onEnded, onError }: Pick<WorkflowMediaProps, "uri" | "immersive" | "onEnded" | "onError">) {
  const { styles: workflowScreenStyles } = useWorkflowStyles();
  const player = useVideoPlayer(uri);
  const { status, error } = useEvent(player, "statusChange", { status: player.status, error: undefined });
  useEventListener(player, "playToEnd", () => onEnded?.());
  useEffect(() => {
    if (status === "error") {
      console.warn("Could not play video", { uri, error });
      onError?.(error?.message || "Could not play video.");
    }
  }, [status, error, uri, onError]);
  useEffect(() => {
    if (immersive) player.play();
  }, [player, immersive]);
  return <>
    <VideoView player={player} nativeControls contentFit="contain" style={{ width: "100%", height: "100%" }} />
    {status === "error" && <Text accessibilityRole="alert" style={[workflowScreenStyles.message, workflowScreenStyles.error]}>
      {`Could not play video.${error?.message ? ` ${error.message}` : ""}\nSource: ${uri}`}
    </Text>}
  </>;
}

export default function WorkflowMedia({ kind, uri, local, immersive, onEnded, onError }: WorkflowMediaProps) {
  const { styles: workflowScreenStyles } = useWorkflowStyles();
  if (kind === "video") return <NativeVideo kind={kind} uri={uri} local={local} immersive={immersive} onEnded={onEnded} onError={onError} />;
  if (kind === "image") return <Image source={{ uri }} resizeMode="contain"
    style={immersive ? workflowScreenStyles.immersiveFill : workflowScreenStyles.media}
    accessibilityLabel="Workflow image" onError={({ nativeEvent }) => {
      console.warn("Could not load workflow image", { uri, error: nativeEvent.error });
      onError?.(nativeEvent.error || "Could not load workflow image.");
    }} />;
  return <View style={workflowScreenStyles.media}>
    <Text accessibilityRole="alert" style={workflowScreenStyles.message}>
      Audio playback is available in the browser PWA.
    </Text>
  </View>;
}
