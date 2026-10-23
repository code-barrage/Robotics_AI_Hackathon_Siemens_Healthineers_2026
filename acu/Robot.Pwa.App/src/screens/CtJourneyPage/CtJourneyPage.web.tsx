import { useCallback, useEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import { useJourneyHost, type HostMessage } from "../../features/ctJourney/journeyHost";

/** Browser preview of the robot (Expo web): same journey page in an iframe, bridged via postMessage. */
export default function CtJourneyPage({ url }: { url: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const pageReady = useRef(false);
  const journeyUrl = useMemo(() => {
    const target = new URL(url);
    if (typeof window !== "undefined" &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") &&
      target.protocol === "http:") {
      target.hostname = window.location.hostname;
    }
    return target.toString();
  }, [url]);
  const origin = useMemo(() => new URL(journeyUrl).origin, [journeyUrl]);
  const send = useCallback((message: HostMessage) => {
    // Until the page says "ready", the iframe still has another origin and the message would be dropped.
    if (pageReady.current) frame.current?.contentWindow?.postMessage(message, origin);
  }, [origin]);
  const handle = useJourneyHost(send);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === "ready") pageReady.current = true;
      void handle(event.data);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [origin, handle]);

  return <View testID="ct-journey-page" style={{ flex: 1 }}>
    <iframe ref={frame} src={journeyUrl} title="CT patient journey" allow="camera; autoplay"
      style={{ border: 0, width: "100%", height: "100%", display: "block" }} />
  </View>;
}
