import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import Slider from "@react-native-community/slider";
import { useTheme } from "../../theme";
import Button from "../Button";
import { RobotTts, type TtsInfo } from "../../platform/robot/robotTts";
import { createStyles } from "./SettingsModal.styles";
import { reportUserError } from "../../api/userError";
import type { SpeechSettings } from "../../platform/robot/speechSettings";

const TEST_PHRASES: Record<string, string> = {
  de: "Hallo, ich bin Ihr Roboter. Bitte folgen Sie mir.",
  en: "Hello, I am your robot. Please follow me.",
  hi: "नमस्ते, मैं आपका रोबोट हूँ। कृपया मेरे पीछे आइए।",
  fr: "Bonjour, je suis votre robot. Suivez-moi, s'il vous plaît.",
  es: "Hola, soy su robot. Por favor, sígame.",
  it: "Ciao, sono il vostro robot. Per favore, seguitemi.",
};

const STATUS_TEXT: Record<TtsInfo["status"], string> = {
  available: "Available",
  missing_data: "Voice data not installed",
  not_supported: "Not supported by this engine",
};

/** On-screen TTS check: engine, status of the ACU-selected language, voiced languages, test button. */
export default function SpeechCheck({ speechLanguage, visible }: { speechLanguage: string; visible: boolean }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [info, setInfo] = useState<TtsInfo | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState<SpeechSettings | null>(null);
  const [draft, setDraft] = useState<Partial<SpeechSettings>>({});
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    setMessage(null);
    RobotTts.getInfo(speechLanguage)
      .then(setInfo)
      .catch((cause: unknown) => { setInfo(null); setMessage(reportUserError(cause, "speech")); });
  }, [speechLanguage]);

  useEffect(() => { if (visible) refresh(); }, [visible, refresh]);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    RobotTts.getSettings()
      .then((value) => { if (active) setSettings(value); })
      .catch((cause: unknown) => { if (active) setMessage(reportUserError(cause, "speech")); });
    return () => { active = false; };
  }, [visible]);

  async function adjust(key: keyof SpeechSettings, value: number) {
    if (!settings || saving) return;
    const next = { ...settings, [key]: value };
    setSaving(true);
    setMessage(null);
    try {
      await RobotTts.saveSettings(next);
      setSettings(next);
    } catch (cause: unknown) {
      setMessage(reportUserError(cause, "speech"));
    } finally {
      setDraft({});
      setSaving(false);
    }
  }

  function testVoice() {
    setMessage(null);
    const phrase = TEST_PHRASES[speechLanguage.split("-")[0]] ?? TEST_PHRASES.en;
    RobotTts.speak(phrase, speechLanguage)
      .then(() => setMessage("Speaking…"))
      .catch((cause: unknown) => setMessage(reportUserError(cause, "speech")));
  }

  function installVoices() {
    RobotTts.openInstallVoiceData()
      .catch((cause: unknown) => setMessage(reportUserError(cause, "speech")));
  }

  const ok = info?.status === "available";
  return (
    <View testID="speech-check" style={styles.section}>
      <Text style={styles.sectionTitle}>Speech (TTS)</Text>
      <View style={styles.speechDetails}>
      <Text style={styles.hint}>Language from ACU: <Text style={styles.speechValue}>{speechLanguage}</Text></Text>
      {info && <>
        <Text style={styles.hint}>Engine: <Text style={styles.speechValue}>{info.engineLabel}</Text></Text>
        <Text testID="speech-status" style={[styles.speechValue, { color: ok ? colors.success : colors.error }]}>
          {STATUS_TEXT[info.status]}
        </Text>
        <Text style={styles.hint} numberOfLines={3}>
          Voices: {info.availableLanguages.length ? info.availableLanguages.join(", ") : "none reported"}
        </Text>
      </>}
      <Text style={styles.hint}>
        Speech volume affects this app only, starting with the next phrase.
        It does not change Android or Peanut volume. Use Test voice after adjusting.
      </Text>
      {settings && ([
        ["volume", "Volume"], ["pitch", "Pitch"], ["rate", "Speed"],
      ] as const).map(([key, label]) => {
        const value = draft[key] ?? settings[key];
        return (
        <View key={key}>
          <Text testID={`speech-${key}-value`} style={styles.speechValue}>
            {label}: {value === null ? "Default (100%)" : key === "volume"
              ? `${Math.round(value * 100)}%` : `${value.toFixed(1)}x`}
          </Text>
          <Slider testID={`speech-${key}`} accessibilityLabel={`Speech ${label.toLowerCase()}`}
            style={styles.speechSlider}
            minimumValue={key === "volume" ? 0 : 0.5} maximumValue={key === "volume" ? 1 : 2}
            step={key === "volume" ? 0.01 : 0.1} value={settings[key] ?? 1}
            minimumTrackTintColor={colors.brand} maximumTrackTintColor={colors.border} thumbTintColor={colors.brand}
            disabled={saving}
            onValueChange={(next) => setDraft({ [key]: next })}
            onSlidingComplete={(next) => { void adjust(key, next); }} />
        </View>
        );
      })}
      {message && <Text testID="speech-message" style={styles.hint}>{message}</Text>}
      </View>
      <View style={styles.speechActions}>
        <Button testID="speech-test" variant="outline" label="Test voice" disabled={saving || !settings} onPress={testVoice} />
        {info && !ok && <Button testID="speech-install" variant="outline" label="Install voices"
          onPress={installVoices} />}
        <Button testID="speech-refresh" variant="outline" label="Recheck" onPress={refresh} />
      </View>
    </View>
  );
}
