import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import type { ReactNode } from "react";
import { GlassBackground, createButtonStyles, glossySurface, useTheme } from "../../theme";
import Button from "../Button";
import SpeechCheck from "./SpeechCheck";
import { createStyles } from "./SettingsModal.styles";

type Props = {
  visible: boolean;
  onClose: () => void;
  onOpenDebug: () => void;
  onReset: () => void;
  header?: ReactNode;
  /** TTS language selected in ACU Settings (from the heartbeat response). */
  speechLanguage: string;
};

export default function SettingsModal({ visible, onClose, onOpenDebug, onReset, header, speechLanguage }: Props) {
  const { colors, mode, setMode } = useTheme();
  const styles = createStyles(colors);
  const buttonStyles = createButtonStyles(colors);
  const dark = mode === "dark";
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        {header}
        <View style={styles.backdrop}>
          <View testID="settings-card" style={[styles.card, glossySurface(colors)]}>
            <GlassBackground />
            <View style={styles.headerRow}>
              <Text style={styles.title}>Settings</Text>
              <Button testID="settings-close" label="Close" accessibilityLabel="Close settings" variant="text" onPress={onClose} />
            </View>
            <ScrollView testID="settings-body" style={styles.body} contentContainerStyle={styles.bodyContent}>
              <View testID="settings-appearance" style={styles.section}>
                <Text style={styles.sectionTitle}>Appearance</Text>
                <View style={styles.themeRow}>
                  <Text style={styles.themeLabel}>Theme</Text>
                  <Pressable testID="theme-toggle" accessibilityRole="switch"
                    accessibilityLabel="Dark theme" accessibilityState={{ checked: dark }}
                    onPress={() => setMode(dark ? "light" : "dark")}
                    style={({ pressed }) => [styles.themeButton, pressed && buttonStyles.pressed]}>
                    <Text style={styles.themeButtonText}>{dark ? "Dark" : "Light"}</Text>
                    <View style={[styles.toggleTrack, { backgroundColor: dark ? colors.brand : colors.border }]}>
                      <View style={[styles.toggleThumb, { alignSelf: dark ? "flex-end" : "flex-start" }]} />
                    </View>
                  </Pressable>
                </View>
              </View>
              <SpeechCheck speechLanguage={speechLanguage} visible={visible} />
              <View testID="settings-diagnostics" style={styles.section}>
                <Text style={styles.sectionTitle}>Diagnostics</Text>
                <Text style={styles.hint}>Open the camera preview and robot diagnostics.</Text>
                <Button testID="debug-button" variant="outline" label="Debug" onPress={onOpenDebug} />
              </View>
              <View testID="settings-reset" style={styles.section}>
                <Text style={styles.sectionTitle}>Reset setup</Text>
                <Text style={styles.hint}>Clear saved configuration and registration to start setup again.</Text>
                <Button testID="clear-reset" label="Clear & Reset" onPress={onReset} />
              </View>
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}