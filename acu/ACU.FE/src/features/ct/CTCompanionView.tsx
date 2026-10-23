import { useT } from "../../i18n/I18nProvider";
import "./CTCompanionView.css";

const companionUrl = (import.meta.env.VITE_CT_COMPANION_URL || "http://localhost:8000").replace(/\/+$/, "");

export default function CTCompanionView() {
  const t = useT();

  return (
    <section className="ct-companion" aria-labelledby="ct-companion-title">
      <header className="ct-companion-header">
        <div>
          <h1 id="ct-companion-title">{t("ctCompanionTitle")}</h1>
          <p>{t("ctCompanionDescription")}</p>
        </div>
        <a className="btn btn-secondary" href={`${companionUrl}/acu`} target="_blank" rel="noopener noreferrer">
          {t("ctCompanionOpen")}
        </a>
      </header>
      <p className="ct-companion-boundary" role="note">{t("ctCompanionBoundary")}</p>
      <p className="ct-companion-positioning" role="note">{t("ctPositioningLimit")}</p>
      <iframe
        className="ct-companion-frame"
        src={`${companionUrl}/acu`}
        title={t("navCtCompanion")}
        allow="microphone; autoplay"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <p className="ct-companion-unavailable">
        {t("ctCompanionUnavailable")}{" "}
        <a href={`${companionUrl}/acu`} target="_blank" rel="noopener noreferrer">{companionUrl}</a>
      </p>
    </section>
  );
}
