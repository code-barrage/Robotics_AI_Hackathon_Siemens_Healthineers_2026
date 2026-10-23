export interface SpeechSettings {
  /** null uses the default utterance gain (100%), without changing system volume. */
  volume: number | null;
  pitch: number;
  rate: number;
}

export const DEFAULT_SPEECH_SETTINGS: Readonly<SpeechSettings> = {
  volume: null, pitch: 1, rate: 1,
};

export function parseSpeechSettings(raw: string | null): SpeechSettings {
  if (raw === null) return { ...DEFAULT_SPEECH_SETTINGS };
  const value: unknown = JSON.parse(raw);
  if (typeof value !== "object" || value === null
    || !("volume" in value) || !("pitch" in value) || !("rate" in value)
    || !(value.volume === null || (typeof value.volume === "number"
      && Number.isFinite(value.volume) && value.volume >= 0 && value.volume <= 1))
    || typeof value.pitch !== "number" || !Number.isFinite(value.pitch) || value.pitch < 0.5 || value.pitch > 2
    || typeof value.rate !== "number" || !Number.isFinite(value.rate) || value.rate < 0.5 || value.rate > 2) {
    throw new Error("Invalid saved speech settings. Volume must be 0-100%, and pitch/speed 0.5-2.");
  }
  return { volume: value.volume, pitch: value.pitch, rate: value.rate };
}
