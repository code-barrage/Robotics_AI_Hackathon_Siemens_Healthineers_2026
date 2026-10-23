import { useEffect, useState } from "react";
import { MdTune, MdInfoOutline } from "../../icons";
import { useI18n, type Language } from "../../i18n/I18nProvider";
import { APP_NAME, APP_VERSION, BRAND_TAGLINE, BUILD_NUMBER, MANUFACTURER } from "../../about";
import { deviceApi } from "../../api/deviceApi";
import "./SettingsView.css";

type SettingsTab = "app" | "about";

const LANGS: { code: Language; short: string }[] = [
  { code: "en", short: "EN" },
  { code: "de", short: "DE" },
];

/** Languages the robot can be told to speak workflow-step TTS in (BCP-47, shown by native name). */
export const SPEECH_LANGUAGES: { code: string; label: string }[] = [
  { code: "de-DE", label: "Deutsch (de-DE)" },
  { code: "en-US", label: "English US (en-US)" },
  { code: "en-GB", label: "English UK (en-GB)" },
  { code: "hi-IN", label: "हिन्दी (hi-IN)" },
  { code: "fr-FR", label: "Français (fr-FR)" },
  { code: "es-ES", label: "Español (es-ES)" },
  { code: "it-IT", label: "Italiano (it-IT)" },
];

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Settings page. Hosts two tabs:
 *
 * - **App**   — runtime preferences (currently just language).
 * - **About** — read-only system / build metadata (image-2 layout).
 *
 * The tablist + tabpanels live in the same container, so the WAI-ARIA tab
 * pattern is genuinely appropriate here (unlike top-level navigation).
 */
export default function SettingsView() {
  const { lang, setLang, t } = useI18n();
  const [tab, setTab] = useState<SettingsTab>("app");
  const [speechLanguage, setSpeechLanguage] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useEffect(() => {
    let cancelled = false;
    deviceApi.getAcuSettings()
      .then((s) => { if (!cancelled) setSpeechLanguage(s.speechLanguage); })
      .catch(() => { if (!cancelled) setSaveState("error"); });
    return () => { cancelled = true; };
  }, []);

  const changeSpeechLanguage = async (code: string) => {
    const previous = speechLanguage;
    setSpeechLanguage(code);
    setSaveState("saving");
    try {
      const saved = await deviceApi.updateAcuSettings({ speechLanguage: code });
      setSpeechLanguage(saved.speechLanguage);
      setSaveState("saved");
    } catch {
      setSpeechLanguage(previous);
      setSaveState("error");
    }
  };

  return (
    <>
      <div className="section-head">
        <div>
          <h2 className="section-title">{t("settingsTitle")}</h2>
        </div>
      </div>

      {/* Tab strip */}
      <div className="settings-tabs" role="tablist" aria-label={t("settingsTitle")}>
        <button
          type="button"
          role="tab"
          id="settings-tab-app"
          aria-controls="settings-panel-app"
          aria-selected={tab === "app"}
          className={`settings-tab ${tab === "app" ? "active" : ""}`}
          onClick={() => setTab("app")}
        >
          <MdTune size={16} /> {t("settingsTabApp")}
        </button>
        <button
          type="button"
          role="tab"
          id="settings-tab-about"
          aria-controls="settings-panel-about"
          aria-selected={tab === "about"}
          className={`settings-tab ${tab === "about" ? "active" : ""}`}
          onClick={() => setTab("about")}
        >
          <MdInfoOutline size={16} /> {t("settingsTabAbout")}
        </button>
      </div>

      {/* App panel */}
      {tab === "app" && (
        <div
          role="tabpanel"
          id="settings-panel-app"
          aria-labelledby="settings-tab-app"
          className="surface-card settings-card"
        >
          <div className="settings-row">
            <div className="settings-row-label">{t("language")}</div>

            <div
              className="lang-pill"
              role="radiogroup"
              aria-label={t("language")}
              data-active={lang}
            >
              <span className="lang-pill-thumb" aria-hidden />
              {LANGS.map((opt) => {
                const active = opt.code === lang;
                return (
                  <button
                    key={opt.code}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`lang-pill-btn ${active ? "active" : ""}`}
                    onClick={() => setLang(opt.code)}
                  >
                    {opt.short}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="settings-row">
            <div>
              <label className="settings-row-label" htmlFor="settings-speech-language">
                {t("robotSpeechLanguage")}
              </label>
              <div className="settings-row-hint" aria-live="polite">
                {saveState === "saving" && t("settingsSaving")}
                {saveState === "saved" && t("settingsSaved")}
                {saveState === "error" && t("settingsSaveFailed")}
                {saveState === "idle" && t("robotSpeechLanguageHint")}
              </div>
            </div>
            <select
              id="settings-speech-language"
              className="select settings-select"
              value={speechLanguage ?? ""}
              disabled={speechLanguage === null || saveState === "saving"}
              onChange={(e) => void changeSpeechLanguage(e.target.value)}
            >
              {speechLanguage === null && <option value="">…</option>}
              {speechLanguage !== null && !SPEECH_LANGUAGES.some((l) => l.code === speechLanguage) && (
                <option value={speechLanguage}>{speechLanguage}</option>
              )}
              {SPEECH_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* About panel */}
      {tab === "about" && (
        <div
          role="tabpanel"
          id="settings-panel-about"
          aria-labelledby="settings-tab-about"
          className="about-panel"
        >
          <div className="surface-card about-card">
            <div className="about-card-head">
              <span className="about-card-dot" aria-hidden />
              <h3 className="about-card-title">{t("systemInformation")}</h3>
            </div>

            <dl className="about-list">
              <div className="about-row">
                <dt>{t("aboutSystem")}</dt>
                <dd>{APP_NAME}</dd>
              </div>
              <div className="about-row">
                <dt>{t("aboutAppVersion")}</dt>
                <dd>{APP_VERSION}</dd>
              </div>
              <div className="about-row">
                <dt>{t("aboutBuildNumber")}</dt>
                <dd className="about-build-number">{BUILD_NUMBER}</dd>
              </div>
              <div className="about-row">
                <dt>{t("aboutManufacturer")}</dt>
                <dd>{MANUFACTURER}</dd>
              </div>
            </dl>
          </div>

          <p className="about-tagline">{BRAND_TAGLINE}</p>
        </div>
      )}
    </>
  );
}
