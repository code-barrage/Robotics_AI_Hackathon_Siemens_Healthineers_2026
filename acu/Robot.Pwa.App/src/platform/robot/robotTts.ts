import { NativeModules, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { parseSpeechSettings, type SpeechSettings } from "./speechSettings";

const SETTINGS_KEY = "robotPwa.speech";
let speechRequest = 0;

export type TtsLanguageStatus = "available" | "missing_data" | "not_supported";

export interface TtsInfo {
  engine: string;
  engineLabel: string;
  languageTag: string;
  status: TtsLanguageStatus;
  /** BCP-47 tags the engine reports it can voice. */
  availableLanguages: string[];
}

/**
 * Native module android/app/src/main/java/com/acu/robotpwa/RobotTtsModule.java — Android system
 * TextToSpeech. `speak` rejects (LANG_NOT_SUPPORTED / LANG_MISSING_DATA / TTS_INIT_FAILED) rather
 * than reading text in the wrong voice.
 */
type NativeTts = {
  speak(text: string, languageTag: string, volume: number, pitch: number, rate: number): Promise<void>;
  stop(): Promise<void>;
  getInfo(languageTag: string): Promise<TtsInfo>;
  openInstallVoiceData(): Promise<void>;
};

type BrowserSpeech = {
  speechSynthesis?: {
    speak(u: unknown): void; cancel(): void;
    getVoices(): { lang: string }[];
  };
  SpeechSynthesisUtterance?: new (text: string) => { lang: string; volume: number; pitch: number; rate: number };
};

function browser(): BrowserSpeech {
  return globalThis as unknown as BrowserSpeech;
}

function native(): NativeTts {
  const module: NativeTts | undefined = NativeModules.RobotTts;
  if (!module) throw new Error("RobotTts native module is missing. Rebuild the Android app.");
  return module;
}

function browserStatus(tag: string): TtsLanguageStatus {
  const voices = browser().speechSynthesis?.getVoices() ?? [];
  const lower = tag.toLowerCase();
  if (voices.some((v) => v.lang.toLowerCase().replace("_", "-") === lower)) return "available";
  return voices.some((v) => v.lang.toLowerCase().startsWith(lower.split("-")[0])) ? "available" : "not_supported";
}

export const RobotTts = {
  async getSettings(): Promise<SpeechSettings> {
    return parseSpeechSettings(await AsyncStorage.getItem(SETTINGS_KEY));
  },
  async saveSettings(settings: SpeechSettings): Promise<void> {
    const validated = parseSpeechSettings(JSON.stringify(settings));
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(validated));
  },
  async speak(text: string, languageTag: string): Promise<void> {
    if (!text.trim()) return;
    const request = ++speechRequest;
    const settings = await RobotTts.getSettings();
    if (request !== speechRequest) return;
    if (Platform.OS === "android") {
      return native().speak(text, languageTag, settings.volume ?? -1, settings.pitch, settings.rate);
    }
    const { speechSynthesis, SpeechSynthesisUtterance } = browser();
    if (!speechSynthesis || !SpeechSynthesisUtterance) return Promise.reject(new Error("Speech synthesis is not available here."));
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = languageTag;
    utterance.volume = settings.volume ?? 1;
    utterance.pitch = settings.pitch;
    utterance.rate = settings.rate;
    speechSynthesis.speak(utterance);
    return Promise.resolve();
  },
  stop(): Promise<void> {
    speechRequest++;
    if (Platform.OS === "android") return native().stop();
    browser().speechSynthesis?.cancel();
    return Promise.resolve();
  },
  getInfo(languageTag: string): Promise<TtsInfo> {
    if (Platform.OS === "android") return native().getInfo(languageTag);
    const voices = browser().speechSynthesis?.getVoices() ?? [];
    return Promise.resolve({
      engine: "browser", engineLabel: "Browser speechSynthesis", languageTag,
      status: browserStatus(languageTag),
      availableLanguages: [...new Set(voices.map((v) => v.lang.replace("_", "-")))].sort(),
    });
  },
  openInstallVoiceData(): Promise<void> {
    if (Platform.OS === "android") return native().openInstallVoiceData();
    return Promise.reject(new Error("Voice data can only be installed on the robot."));
  },
};
