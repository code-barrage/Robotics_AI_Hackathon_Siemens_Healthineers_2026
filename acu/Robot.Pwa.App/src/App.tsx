import { useState } from "react";
import { ActivityIndicator, Modal, SafeAreaView, Text, View } from "react-native";
import { ThemeProvider, useTheme } from "./theme";

import ConfigPage, { useRegisteredAcuDiscovery } from "./screens/ConfigPage/ConfigPage";
import RegisterPage from "./screens/RegisterPage";
import StartPage from "./screens/StartPage/StartPage";
import CameraDebugPage from "./screens/CameraDebugPage";
import RobotWorkflowPage from "./screens/RobotWorkflowPage/RobotWorkflowPage";
import CtJourneyPage from "./screens/CtJourneyPage/CtJourneyPage";
import { ctJourneyUrl } from "./features/ctJourney/journeyHost";
import AppHeader from "./components/AppHeader";
import SettingsModal from "./components/SettingsModal";
import { createStyles } from "./App.styles";
import useDestinations, { RobotSyncContext } from "./features/destinations/hooks/useDestinations";
import useAssignedWorkflow from "./features/workflows/hooks/useAssignedWorkflow";
import useRemoteControl from "./features/remote/useRemoteControl";
import useAppStage from "./navigation/useAppStage";
import type { DestinationProgress } from "./features/workflows/model/workflowPresentation";

export default function App() {
  return <ThemeProvider><AppContent /></ThemeProvider>;
}

function AppContent() {
  const { colors, error: themeError } = useTheme();
  const styles = createStyles(colors);
  const { stage, error, refresh, reset } = useAppStage();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const ready = stage === "ready";
  const discoveryError = useRegisteredAcuDiscovery(ready);
  const robotSync = useDestinations(ready);
  useRemoteControl(robotSync, ready);
  const isOnline = robotSync.online;
  const workflow = useAssignedWorkflow(ready);
  const [progress, setProgress] = useState<DestinationProgress | null>(null);
  const headerProgress = ready && workflow.active ? progress : null;
  const journeyUrl = ready ? ctJourneyUrl(workflow.assigned) : null;

  async function handleReset() {
    await reset();
    setSettingsOpen(false);
  }

  return (
    <SafeAreaView testID="app-shell" style={styles.app}>
      <AppHeader online={isOnline} registered={ready} progress={headerProgress}
        onSettings={() => setSettingsOpen(true)} />
      <View style={[styles.shell, ready && styles.fullShell]}>
        {(error || themeError || discoveryError) && <Text accessibilityRole="alert" style={styles.error}>{error || themeError || discoveryError}</Text>}
        <View style={styles.main}>
          {stage === "loading" && !error && <ActivityIndicator size="large" color={colors.brand} />}
          {stage === "config" && <ConfigPage onSaved={refresh} />}
          {stage === "register" && (
            <RegisterPage onRegistered={refresh} />
          )}
          {ready && <RobotSyncContext.Provider value={robotSync}>
            {journeyUrl
              ? <CtJourneyPage url={journeyUrl} />
              : workflow.active
              ? <RobotWorkflowPage
                run={workflow.active} acuUrl={workflow.acuUrl}
                completing={workflow.completing} onComplete={workflow.complete} onProgress={setProgress} />
              : <StartPage assigned={workflow.assigned} starting={workflow.starting || workflow.completing}
                onStart={() => { void workflow.start(); }} />}
            {workflow.error && <Text accessibilityRole="alert" style={styles.error}>{workflow.error}</Text>}
          </RobotSyncContext.Provider>}
        </View>
      </View>
      <Modal visible={debugOpen} animationType="slide" onRequestClose={() => setDebugOpen(false)}>
        <SafeAreaView style={styles.debugShell}>
          <AppHeader online={isOnline} registered={ready}
            onSettings={() => { setDebugOpen(false); setSettingsOpen(true); }} />
          <CameraDebugPage onClose={() => setDebugOpen(false)} />
        </SafeAreaView>
      </Modal>
      <SettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onOpenDebug={() => { setSettingsOpen(false); setDebugOpen(true); }}
        onReset={handleReset}
        speechLanguage={robotSync.speechLanguage}
        header={<AppHeader online={isOnline} registered={ready}
          onSettings={() => setSettingsOpen(false)} />}
      />
    </SafeAreaView>
  );
}