import { useEffect, useState } from "react";
import { MdSmartToy, MdCloudOff } from "../../icons";
import { useT } from "../../i18n/I18nProvider";
import { APP_NAME } from "../../about";
import "./AppShell.css";

interface Props {
  /** Timestamp of the most recent successful data refresh. Shown only when
   *  offline, as a tooltip on the "Server unreachable" pill so the operator
   *  can see exactly when the last successful sync happened. */
  lastRefreshed?: Date;
  /** Whether the latest poll succeeded. While true, the bar shows a
   *  small live status pill; while false, it shows a "Server unreachable" warning. */
  isServerOnline?: boolean;
}

type T = ReturnType<typeof useT>;

function formatAgo(date: Date, now: number, t: T): string {
  const seconds = Math.max(0, Math.floor((now - date.getTime()) / 1000));
  if (seconds < 60) return t("agoSecondsMany", { count: seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes === 1) return t("agoMinuteOne");
  if (minutes < 60)  return t("agoMinutesMany", { count: minutes });
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? t("agoHourOne") : t("agoHoursMany", { count: hours });
}

/**
 * Top app bar — brand on the left, polling status on the right.
 *
 * Status indicator:
 * - Online  → small green "Live" pill (data auto-polls every 3 s).
 * - Offline → amber "Server unreachable" pill (with the last-good
 *             timestamp surfaced via tooltip).
 */
export default function TopBar({ lastRefreshed, isServerOnline = true }: Props) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());

  // Tick once per second while offline so the tooltip stays accurate.
  useEffect(() => {
    if (isServerOnline || !lastRefreshed) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isServerOnline, lastRefreshed]);

  const staleTooltip = lastRefreshed
    ? t("lastUpdated", { ago: formatAgo(lastRefreshed, now, t) })
    : undefined;

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <div className="topbar-logo" aria-hidden>
          <MdSmartToy size={22} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="topbar-title">{APP_NAME}</div>
        </div>
      </div>

      {isServerOnline ? (
        <div className="topbar-live" aria-live="polite">
          <span className="topbar-live-dot" aria-hidden />
          {t("statusLive")}
        </div>
      ) : (
        <div
          className="topbar-offline-icon"
          role="img"
          aria-label={t("statusServerUnreachable")}
          title={staleTooltip ?? t("statusServerUnreachable")}
        >
          <MdCloudOff size={20} />
        </div>
      )}
    </header>
  );
}
