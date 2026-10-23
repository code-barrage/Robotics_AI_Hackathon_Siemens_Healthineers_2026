import { useEffect, useState } from "react";
import { Platform, ScrollView, Text, TextInput, View } from "react-native";

import { loadConfig, saveConfig } from "../../storage/appStorage";
import { isConfigValid } from "../../config/validation";
import type { PuduConfig } from "../../config/types";
import { AcuDiscovery } from "../../platform/discovery/acuDiscovery";
import { useTheme } from "../../theme";
import Button from "../../components/Button";
import { createStyles } from "./ConfigPage.styles";

// Keep updating the saved endpoint after the setup screen has unmounted.
export function useRegisteredAcuDiscovery(registered: boolean) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!registered || Platform.OS !== "android") return;
    let active = true;
    let receivedAnnouncement = false;
    let pending = Promise.resolve();
    const failed = (cause: unknown) => {
      console.warn("Could not update discovered ACU address", cause);
      if (active) setError("Could not update ACU address.");
    };
    const update = (url: string) => {
      pending = pending.then(async () => {
        if (!active) return;
        const config = await loadConfig();
        if (!active) return;
        if (url !== config.acuUrl) await saveConfig({ ...config, acuUrl: url });
        if (active) setError(null);
      }).catch(failed);
    };
    const listener = AcuDiscovery.addListener("discovered", ({ url }) => {
      receivedAnnouncement = true;
      update(url);
    });
    void AcuDiscovery.getDiscoveredUrl().then(({ url }) => {
      if (url && !receivedAnnouncement) update(url);
    }).catch(failed);
    return () => { active = false; listener.remove(); };
  }, [registered]);
  return error;
}

interface Props {
  onSaved: () => void;
}

const EMPTY_CONFIG: PuduConfig = {
  apiAppKey: "",
  apiAppSecret: "",
  puduUrlCss: "",
  robotSn: "",
  acuUrl: "",
};

export default function ConfigPage({ onSaved }: Props) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  // AsyncStorage is async, so the config can no longer be read synchronously as the initial
  // state value (unlike the old `useState<PuduConfig>(loadConfig())`) — it's loaded in the
  // effect below instead, starting from an empty placeholder.
  const [config, setConfig] = useState<PuduConfig>(EMPTY_CONFIG);
  const [error, setError] = useState<string | null>(null);
  const [discoveredInfo, setDiscoveredInfo] = useState<string | null>(null);

  useEffect(() => {
    loadConfig().then(setConfig).catch((cause: unknown) => {
      console.warn("Could not load configuration", cause);
      setError("Could not load settings.");
    });

    if (Platform.OS === "web") return;

    // Check if URL was already discovered natively
    AcuDiscovery.getDiscoveredUrl()
      .then((res) => {
        if (res.url) {
          const discoveredUrl = res.url;
          setConfig((c) => (c.acuUrl ? c : { ...c, acuUrl: discoveredUrl }));
          setDiscoveredInfo(`Discovered via mDNS: ${discoveredUrl}`);
        }
      })
      .catch((cause: unknown) => {
        console.warn("ACU discovery failed", cause);
        setError("ACU not found. Enter the server address.");
      });

    // Listen for live mDNS service announcements
    const listener = AcuDiscovery.addListener("discovered", (endpoint) => {
      setConfig((c) => {
        // Auto-fill if empty or if user hasn't explicitly customized it away
        if (!c.acuUrl || c.acuUrl.includes("localhost")) {
          return { ...c, acuUrl: endpoint.url };
        }
        return c;
      });
      setDiscoveredInfo(`Discovered via mDNS: ${endpoint.url}`);
    });

    return () => {
      listener.remove();
    };
  }, []);

  function update<K extends keyof PuduConfig>(key: K, value: string) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  async function handleSave() {
    if (!isConfigValid(config)) {
      setError("All fields are required.");
      return;
    }
    try {
      await saveConfig(config);
      setError(null);
      onSaved();
    } catch (cause) {
      console.warn("Could not save configuration", cause);
      setError("Could not save settings.");
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.card}>
        <Text style={styles.heading}>Configuration</Text>
        {/* <Text style={styles.hint}>Pudu Cloud credentials, used to sign requests directly from this app.</Text>
        {Platform.OS === "web" && (
          <Text style={styles.hint}>Browser preview: mDNS discovery is unavailable. Enter the ACU URL manually.</Text>
        )} */}

        <Text style={styles.label}>API_APP_KEY</Text>
        <TextInput
          style={styles.input}
          value={config.apiAppKey}
          placeholderTextColor={colors.muted}
          onChangeText={(v) => update("apiAppKey", v)}
          autoCapitalize="none"
        />

        <Text style={styles.label}>API_APP_SECRET</Text>
        <TextInput
          style={styles.input}
          value={config.apiAppSecret}
          placeholderTextColor={colors.muted}
          onChangeText={(v) => update("apiAppSecret", v)}
          secureTextEntry
          autoCapitalize="none"
        />

        <Text style={styles.label}>PUDU_URL_CSS</Text>
        <TextInput
          style={styles.input}
          placeholder="https://css-open-platform.pudutech.com/pudu-entry"
          placeholderTextColor={colors.muted}
          value={config.puduUrlCss}
          onChangeText={(v) => update("puduUrlCss", v)}
          autoCapitalize="none"
        />

        <Text style={styles.label}>ROBOT_SN</Text>
        <TextInput
          style={styles.input}
          value={config.robotSn}
          placeholderTextColor={colors.muted}
          onChangeText={(v) => update("robotSn", v)}
          autoCapitalize="none"
        />

        <Text style={styles.label}>
          ACU_URL {discoveredInfo ? <Text style={styles.ok}>({discoveredInfo})</Text> : null}
        </Text>
        <TextInput
          style={styles.input}
          placeholder={Platform.OS === "web" ? "http://localhost:3000" : "Auto-discovering ACU via mDNS..."}
          placeholderTextColor={colors.muted}
          value={config.acuUrl}
          onChangeText={(v) => update("acuUrl", v)}
          autoCapitalize="none"
        />

        {error && <Text style={styles.error}>{error}</Text>}
        <Button label="Save & Continue" onPress={handleSave} style={styles.button} />
      </View>
    </ScrollView>
  );
}
