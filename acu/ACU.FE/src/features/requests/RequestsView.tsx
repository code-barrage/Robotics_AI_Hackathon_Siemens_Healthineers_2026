import { useState } from "react";
import type { DeviceRequest, ConnectionStatus } from "../../types";
import {
  MdSmartToy, MdHourglassEmpty, MdCheckCircle, MdCancel,
  MdAccessTime, MdClose, MdCheck,
} from "../../icons";
import EmptyState from "../../components/ui/EmptyState";
import { useT } from "../../i18n/I18nProvider";
import type { Dict } from "../../i18n/en";

interface Props {
  requests: DeviceRequest[];
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  loadingId: string | null;
  lastRefreshed: Date;
}

const FILTERS: { value: ConnectionStatus | "all"; labelKey: keyof Dict }[] = [
  { value: "all",      labelKey: "filterAll"      },
  { value: "pending",  labelKey: "filterPending"  },
  { value: "approved", labelKey: "filterApproved" },
  { value: "denied",   labelKey: "filterDenied"   },
];

const DEVICE_TYPE_KEYS: Record<DeviceRequest["deviceType"], keyof Dict> = {
  "robot-arm":    "devTypeRobotArm",
  "mobile-robot": "devTypeMobileRobot",
  "drone":        "devTypeDrone",
  "sensor-unit":  "devTypeSensorUnit",
  "controller":   "devTypeController",
};

type T = ReturnType<typeof useT>;

function timeAgo(iso: string, t: T): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("agoJustNow");
  if (mins === 1) return t("agoMinuteOne");
  if (mins < 60) return t("agoMinutesMany", { count: mins });
  const hrs = Math.floor(mins / 60);
  return hrs === 1 ? t("agoHourOne") : t("agoHoursMany", { count: hrs });
}

/** Single request card (pending shows the action footer). */
function RequestCard({
  request, onApprove, onDeny, isLoading, t,
}: {
  request: DeviceRequest;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  isLoading: boolean;
  t: T;
}) {
  const tone = request.status === "pending" ? "warning"
            : request.status === "approved" ? "success"
            : "danger";

  return (
    <article className={`card tone-${tone}`}>
      <div className="card-header">
        <div className="topbar-logo" style={{ background: "var(--brand-50)", color: "var(--brand)" }}>
          <MdSmartToy size={22} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: "var(--fs-md)", margin: 0, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {request.deviceName}
          </h3>
          <span className="pill pill-neutral" style={{ marginTop: 4 }}>
            {t(DEVICE_TYPE_KEYS[request.deviceType])}
          </span>
        </div>
        <span className={`pill pill-${tone}`}>
          {request.status === "pending"  && <><MdHourglassEmpty size={13} />{t("statusPending")}</>}
          {request.status === "approved" && <><MdCheckCircle    size={13} />{t("statusApproved")}</>}
          {request.status === "denied"   && <><MdCancel         size={13} />{t("statusDenied")}</>}
        </span>
      </div>

      <div className="card-body">
        {request.description && (
          <p style={{ color: "var(--text-muted)", fontSize: "var(--fs-sm)", marginBottom: "var(--space-3)" }}>
            {request.description}
          </p>
        )}
        <div className="meta-grid">
          <div className="meta-item"><span className="meta-label">{t("deviceId")}</span><span className="meta-value mono">{request.deviceId}</span></div>
          <div className="meta-item"><span className="meta-label">{t("ipAddress")}</span><span className="meta-value mono">{request.ipAddress}</span></div>
          <div className="meta-item"><span className="meta-label">{t("macAddress")}</span><span className="meta-value mono">{request.macAddress}</span></div>
          <div className="meta-item"><span className="meta-label">{t("firmware")}</span><span className="meta-value mono">{request.firmwareVersion ?? "—"}</span></div>
        </div>
        <div style={{ marginTop: "var(--space-3)", fontSize: "var(--fs-xs)", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <MdAccessTime size={13} />
          {t("requestedAgo", { ago: timeAgo(request.requestedAt, t) })}
        </div>
      </div>

      {request.status === "pending" && (
        <div className="card-footer" style={{ justifyContent: "stretch" }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ flex: 1 }}
            disabled={isLoading}
            onClick={() => onDeny(request.id)}
          >
            <MdClose size={16} />{t("deny")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 1 }}
            disabled={isLoading}
            onClick={() => onApprove(request.id)}
          >
            <MdCheck size={16} />{t("approve")}
          </button>
        </div>
      )}
    </article>
  );
}

export default function RequestsView({ requests, onApprove, onDeny, loadingId, lastRefreshed }: Props) {
  const t = useT();
  const [filter, setFilter] = useState<ConnectionStatus | "all">("all");
  const filtered = filter === "all" ? requests : requests.filter((r) => r.status === filter);

  const counts: Record<ConnectionStatus | "all", number> = {
    all:      requests.length,
    pending:  requests.filter((r) => r.status === "pending").length,
    approved: requests.filter((r) => r.status === "approved").length,
    denied:   requests.filter((r) => r.status === "denied").length,
  };

  const emptyTitle = filter === "all"
    ? t("noRequestsAll")
    : t("noRequestsFiltered", { status: t(
        filter === "pending"  ? "statusPending"
        : filter === "approved" ? "statusApproved"
        : "statusDenied"
      ).toLowerCase() });

  return (
    <>
      <div className="section-head">
        <div>
          <h2 className="section-title">{t("connectionRequests")}</h2>
          <p className="section-subtitle">
            {lastRefreshed.toLocaleTimeString()}
          </p>
        </div>
      </div>

      <div className="filter-row" role="tablist" aria-label={t("connectionRequests")}>
        {FILTERS.map((f) => {
          const active = filter === f.value;
          const count  = counts[f.value];
          return (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={active}
              className={`filter-chip ${active ? "active" : ""}`}
              onClick={() => setFilter(f.value)}
            >
              <span>{t(f.labelKey)}</span>
              <span className="filter-chip-count">{count}</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<MdSmartToy size={32} />}
          title={emptyTitle}
          description={t("noRequestsDesc")}
        />
      ) : (
        <div className="grid-cards">
          {filtered.map((req) => (
            <RequestCard
              key={req.id}
              request={req}
              onApprove={onApprove}
              onDeny={onDeny}
              isLoading={loadingId === req.id}
              t={t}
            />
          ))}
        </div>
      )}
    </>
  );
}
