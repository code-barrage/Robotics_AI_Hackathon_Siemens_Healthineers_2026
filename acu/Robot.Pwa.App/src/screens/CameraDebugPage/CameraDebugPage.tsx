import { useEffect, useRef, useState } from "react";
import { Image, ScrollView, Text, View } from "react-native";

import {
  CAMERAS,
  PuduCamera,
  cameraBackend,
  type CameraFrame,
  type CameraId,
  type CameraInfo,
} from "../../platform/robot/puduCamera";
import { useTheme, type Palette } from "../../theme";
import { createStyles } from "./CameraDebugPage.styles";
import Button from "../../components/Button";

interface Props {
  onClose: () => void;
}

interface Stats {
  frames: number;
  fps: number;
  width: number;
  height: number;
  lastAt: number;
  jpeg?: string;
  perLayer: Record<number, number>;
  layerJpeg: Record<number, string>;
  layerAt: Record<number, number>;
}

const EMPTY_STATS: Stats = { frames: 0, fps: 0, width: 0, height: 0, lastAt: 0, perLayer: {}, layerJpeg: {}, layerAt: {} };
const freshStats = (): Stats => ({ ...EMPTY_STATS, perLayer: {}, layerJpeg: {}, layerAt: {} });
const BACKEND_LABEL = {
  native: "Native (robot)",
  unavailable: "Robot cameras unavailable on this device",
} as const;

export default function CameraDebugPage({ onClose }: Props) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [bound, setBound] = useState(PuduCamera.isBound());
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState<Record<CameraId, boolean>>(
    () => Object.fromEntries(CAMERAS.map((c) => [c.id, PuduCamera.isRunning(c.id)])) as Record<CameraId, boolean>
  );
  const [stats, setStats] = useState<Record<CameraId, Stats>>(
    () => Object.fromEntries(CAMERAS.map((c) => [c.id, EMPTY_STATS])) as Record<CameraId, Stats>
  );
  const [now, setNow] = useState(Date.now());
  const [log, setLog] = useState<string[]>([]);
  const live = useRef<Record<CameraId, Stats>>(
    Object.fromEntries(CAMERAS.map((c) => [c.id, freshStats()])) as Record<CameraId, Stats>
  );
  const lastTick = useRef<Record<CameraId, { at: number; frames: number }>>(
    Object.fromEntries(CAMERAS.map((c) => [c.id, { at: Date.now(), frames: 0 }])) as Record<CameraId, { at: number; frames: number }>
  );

  function addLog(message: string) {
    const time = new Date().toLocaleTimeString();
    setLog((l) => [`${time}  ${message}`, ...l].slice(0, 40));
  }

  useEffect(() => {
    const offFrame = PuduCamera.onFrame((f: CameraFrame) => {
      const s = live.current[f.camera];
      s.frames += 1;
      s.width = f.width;
      s.height = f.height;
      s.lastAt = Date.now();
      if (f.jpeg) s.jpeg = f.jpeg;
      if (f.location !== undefined) {
        s.perLayer[f.location] = (s.perLayer[f.location] ?? 0) + 1;
        s.layerAt[f.location] = s.lastAt;
        if (f.jpeg) s.layerJpeg[f.location] = f.jpeg;
      }
    });
    const offLog = PuduCamera.onLog((m) => addLog(m));
    const offGateway = PuduCamera.onGatewayChange((b) => {
      setBound(b);
      addLog(b ? "Gateway connected" : "Gateway disconnected");
    });

    // Snapshot the live counters twice a second to keep re-renders cheap.
    const timer = setInterval(() => {
      const t = Date.now();
      const next = {} as Record<CameraId, Stats>;
      CAMERAS.forEach(({ id }) => {
        const s = live.current[id];
        const prev = lastTick.current[id];
        const fps = ((s.frames - prev.frames) * 1000) / Math.max(1, t - prev.at);
        lastTick.current[id] = { at: t, frames: s.frames };
        next[id] = { ...s, fps, perLayer: { ...s.perLayer }, layerJpeg: { ...s.layerJpeg }, layerAt: { ...s.layerAt } };
      });
      setStats(next);
      setNow(t);
    }, 500);

    return () => {
      offFrame();
      offGateway();
      offLog();
      clearInterval(timer);
      // Leaving the screen must hand the cameras back to Peanut (face off, Mark on, listeners removed).
      if (PuduCamera.isBound()) PuduCamera.unbind().catch(() => {});
    };
  }, []);

  async function run(label: string, action: () => Promise<void>, after?: () => void) {
    setBusy(true);
    try {
      await action();
      after?.();
      addLog(`${label}: OK`);
    } catch (err) {
      addLog(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  function syncRunning() {
    setRunning(Object.fromEntries(CAMERAS.map((c) => [c.id, PuduCamera.isRunning(c.id)])) as Record<CameraId, boolean>);
  }

  function resetStats() {
    CAMERAS.forEach(({ id }) => {
      live.current[id] = freshStats();
      lastTick.current[id] = { at: Date.now(), frames: 0 };
    });
    setStats(Object.fromEntries(CAMERAS.map((c) => [c.id, EMPTY_STATS])) as Record<CameraId, Stats>);
  }

  return (
    <View testID="camera-debug" style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Camera debug</Text>
        <Button testID="camera-debug-close" label="Close" variant="outline" onPress={onClose} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Robot gateway</Text>
              <Text style={styles.muted}>TpRobotGatewayAidlService {"\u00b7"} com.pudutech.robot.peanut</Text>
              <Text style={styles.muted} testID="camera-backend">Backend: {BACKEND_LABEL[cameraBackend]}</Text>
            </View>
            <Badge colors={colors} on={bound} onLabel="CONNECTED" offLabel="DISCONNECTED" />
          </View>
          <View style={styles.row}>
            <Button
              testID="gateway-toggle"
              label={bound ? "Disconnect" : "Connect"}
              disabled={busy}
              onPress={() =>
                run(bound ? "Disconnect" : "Connect", bound ? () => PuduCamera.unbind() : () => PuduCamera.bind(), () => {
                  syncRunning();
                  if (bound) resetStats();
                })
              }
            />
            <Button variant="outline" label="Reset counters" onPress={resetStats} />
          </View>
        </View>

        {CAMERAS.filter((cam) => cam.id !== "mark").map((cam) => (
          <CameraCard
            key={cam.id}
            cam={cam}
            colors={colors}
            styles={styles}
            bound={bound}
            busy={busy}
            running={running[cam.id]}
            stats={stats[cam.id]}
            now={now}
            onReRegister={cam.id === "tray" ? () => run("Re-register tray listener", () => PuduCamera.reRegisterTray()) : undefined}
            onToggle={() =>
              run(
                `${running[cam.id] ? "Stop" : "Start"} ${cam.id}`,
                () => (running[cam.id] ? PuduCamera.stop(cam.id) : PuduCamera.start(cam.id)),
                syncRunning
              )
            }
          />
        ))}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Event log</Text>
          {log.length === 0 && <Text style={styles.muted}>No events yet.</Text>}
          {log.map((line, i) => (
            <Text key={i} style={styles.logLine}>{line}</Text>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function Badge({ colors, on, onLabel, offLabel }: { colors: Palette; on: boolean; onLabel: string; offLabel: string }) {
  const styles = createStyles(colors);
  const color = on ? colors.success : colors.muted;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{on ? onLabel : offLabel}</Text>
    </View>
  );
}

interface CardProps {
  cam: CameraInfo;
  colors: Palette;
  styles: ReturnType<typeof createStyles>;
  bound: boolean;
  busy: boolean;
  running: boolean;
  stats: Stats;
  now: number;
  onToggle: () => void;
  onReRegister?: () => void;
}

function CameraCard({ cam, colors, styles, bound, busy, running, stats, now, onToggle, onReRegister }: CardProps) {
  const age = stats.lastAt ? now - stats.lastAt : null;
  const streaming = bound && running && age !== null && age < 2000;
  const resolution = stats.width ? `${stats.width}\u00d7${stats.height}` : "\u2014";

  return (
    <View testID={`camera-${cam.id}`} style={styles.card}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{cam.title}</Text>
          <Text style={styles.muted}>{cam.description}</Text>
        </View>
        <Badge colors={colors} on={streaming} onLabel="LIVE" offLabel={bound && running ? "NO FRAMES" : "STOPPED"} />
      </View>

      {cam.id === "tray" ? (
        <View testID="camera-tray-preview" style={styles.layerRow}>
          {[0, 1].map((layer) => {
            const layerAge = stats.layerAt[layer] ? now - stats.layerAt[layer] : null;
            const layerLive = bound && layerAge !== null && layerAge < 2000;
            const jpeg = stats.layerJpeg[layer];
            return (
              <View key={layer} style={{ flex: 1, gap: 4 }} testID={`camera-tray-layer-${layer}`}>
                <View style={[styles.preview, { height: 140 }]}>
                  {jpeg ? (
                    <Image source={{ uri: `data:image/jpeg;base64,${jpeg}` }} style={styles.previewImage} resizeMode="contain" />
                  ) : (
                    <Text style={styles.previewText}>
                      {layerLive ? `Layer ${layer}: Receiving frame #${stats.perLayer[layer] ?? 0}` : bound ? `Layer ${layer}: waiting\u2026` : "Not connected"}
                    </Text>
                  )}
                  {layerLive && <View style={[styles.liveDot, { backgroundColor: colors.error }]} />}
                </View>
                <Text style={styles.muted}>
                  Layer {layer} ({layer === 0 ? "first" : "second"}): {stats.perLayer[layer] ?? 0} frames {"\u00b7"}{" "}
                  {layerAge === null ? "no frame yet" : `${(layerAge / 1000).toFixed(1)}s ago`}
                </Text>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.preview} testID={`camera-${cam.id}-preview`}>
          {stats.jpeg ? (
            <Image source={{ uri: `data:image/jpeg;base64,${stats.jpeg}` }} style={styles.previewImage} resizeMode="contain" />
          ) : (
            <Text style={styles.previewText}>
              {streaming ? `Receiving frame #${stats.frames}` : bound ? "Waiting for frames\u2026" : "Not connected"}
            </Text>
          )}
          {streaming && <View style={[styles.liveDot, { backgroundColor: colors.error }]} />}
        </View>
      )}

      <View style={styles.statsRow}>
        <Stat styles={styles} label="Frames" value={String(stats.frames)} />
        <Stat styles={styles} label="FPS" value={stats.fps.toFixed(1)} />
        <Stat styles={styles} label="Resolution" value={resolution} />
        <Stat styles={styles} label="Last frame" value={age === null ? "\u2014" : `${(age / 1000).toFixed(1)}s ago`} />
      </View>

      {cam.warning && <Text style={[styles.muted, { color: colors.error }]}>{cam.warning}</Text>}
      <Text style={styles.api}>{cam.apis.join(" \u00b7 ")}</Text>

      {cam.switchable ? (
        <Button
          testID={`camera-${cam.id}-toggle`}
          label={running ? "Stop camera" : "Start camera"}
          disabled={!bound || busy}
          onPress={onToggle}
        />
      ) : (
        <>
          <Text style={styles.muted}>Always on: no start/stop call exists for this camera.</Text>
          {onReRegister && (
            <Button
              testID="camera-tray-reregister"
              label="Re-register tray listener"
              variant="outline"
              disabled={!bound || busy}
              onPress={onReRegister}
            />
          )}
        </>
      )}
    </View>
  );
}

function Stat({ styles, label, value }: { styles: ReturnType<typeof createStyles>; label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}
