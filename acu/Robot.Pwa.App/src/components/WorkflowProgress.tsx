import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, useWindowDimensions, View } from "react-native";
import type { DestinationProgress } from "../features/workflows/model/workflowPresentation";
import { BorderWidth, Size, useTheme } from "../theme";
import { styles } from "./WorkflowProgress.styles";

export default function WorkflowProgress({ progress }: { progress: DestinationProgress }) {
  const { colors } = useTheme();
  const compact = useWindowDimensions().width < 600;
  const [width, setWidth] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const { reached: done, total, destinations } = progress;
  const stopWidth = Math.max(compact ? Size.progressStopCompact : Size.progressStop,
    Size.progressLabelWidth,
    (width - Size.progressLabelWidth) / Math.max(1, total - 1));
  const next = destinations[done];

  useEffect(() => {
    scroll.current?.scrollTo({ x: Math.max(0, Math.min(done, total - 1) * stopWidth - stopWidth), animated: true });
  }, [done, total, stopWidth]);

  return <View testID="workflow-progress" accessibilityRole="progressbar"
    accessibilityLabel={`${done} of ${total} destinations reached${next ? `. Next: ${next}` : ". Route complete"}`}
    aria-valuenow={done} aria-valuemin={0} aria-valuemax={total}
    accessibilityValue={{ min: 0, max: total, now: done }} style={styles.root}>
    <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false}
      testID="workflow-progress-track" style={styles.viewport}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <View style={styles.track}>
        {destinations.map((name, i) => {
          const isDone = i < done;
          const isNext = i === done;
          const accent = colors.brand;
          return <View key={`${i}-${name}`} style={[styles.stop,
            { width: i === total - 1 ? Size.progressLabelWidth : stopWidth }]}>
            <View style={styles.destination}>
              <View testID={`workflow-progress-dot-${i}`} accessibilityLabel={`${name}: ${isDone ? "reached" : isNext ? "next" : "upcoming"}`}
                style={[styles.dot, { backgroundColor: isDone ? accent : colors.background,
                  borderColor: isDone || isNext ? accent : colors.border,
                  borderWidth: isNext ? BorderWidth.emphasized : BorderWidth.standard }]}>
                {isDone ? <Text testID={`workflow-progress-tick-${i}`} style={[styles.tick, { color: colors.white }]}>✓</Text> :
                  <Text style={[styles.number, { color: isNext ? accent : colors.muted }]}>{i + 1}</Text>}
              </View>
              <Text testID={`workflow-progress-label-${i}`} style={[styles.label,
                { color: isDone || isNext ? accent : colors.muted }]}>{name}</Text>
            </View>
              {i < total - 1 && <View testID={`workflow-progress-line-${i}`}
                style={[styles.line, styles.connector, { width: stopWidth - Size.progressDot,
                  backgroundColor: isDone ? accent : colors.progressTrack }]} />}
          </View>;
        })}
      </View>
    </ScrollView>
  </View>;
}
