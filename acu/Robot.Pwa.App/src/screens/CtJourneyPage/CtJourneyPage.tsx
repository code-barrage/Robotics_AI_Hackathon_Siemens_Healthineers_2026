import { useCallback, useRef, useState } from "react";
import { Text, View } from "react-native";
import { WebView } from "react-native-webview";
import Button from "../../components/Button";
import { useJourneyHost, type HostMessage } from "../../features/ctJourney/journeyHost";
import { useWorkflowStyles } from "../RobotWorkflowPage/WorkflowScreen.styles";

/** Full-screen CT patient journey served by the CT Companion server, with robot hardware bridged in. */
export default function CtJourneyPage({ url }: { url: string }) {
  const { styles } = useWorkflowStyles();
  const view = useRef<WebView>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const send = useCallback((message: HostMessage) => {
    view.current?.injectJavaScript(`window.ctHost && window.ctHost.receive(${JSON.stringify(message)}); true;`);
  }, []);
  const handle = useJourneyHost(send);

  return <View testID="ct-journey-page" style={{ flex: 1 }}>
    <WebView ref={view} source={{ uri: url }} style={{ flex: 1 }}
      onMessage={(event) => { void handle(event.nativeEvent.data); }}
      onLoadStart={() => setFailure(null)}
      onError={(event) => setFailure(event.nativeEvent.description || "The CT Companion server did not respond.")}
      onHttpError={(event) => setFailure(`CT Companion server returned ${event.nativeEvent.statusCode}.`)}
      javaScriptEnabled domStorageEnabled mediaPlaybackRequiresUserAction={false}
      allowsInlineMediaPlayback mixedContentMode="always" originWhitelist={["*"]}
      setSupportMultipleWindows={false} overScrollMode="never" />
    {failure && <View style={[styles.center, { position: "absolute", inset: 0, backgroundColor: "#fff" }]}>
      <Text accessibilityRole="alert" style={styles.title}>Patient screen unavailable</Text>
      <Text style={styles.message}>{`${failure}\n${url}`}</Text>
      <Button label="Try again" onPress={() => { setFailure(null); view.current?.reload(); }} />
    </View>}
  </View>;
}
