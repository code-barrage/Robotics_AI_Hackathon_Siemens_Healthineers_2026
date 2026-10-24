import { useEffect, useState } from "react";
import type {
  RegisteredDevice, DeviceRequest, Workflow, FollowMeStep, MapDestination,
} from "../../types";
import {
  MdSmartToy, MdWifi, MdWifiOff, MdNotifications,
  MdCheckCircle, MdClose, MdCheck, MdLinkOff, MdRoute, MdInfoOutline,
  MdAssignment, MdEdit, MdLocationOn, MdArrowBack, MdFlag, MdMap,
} from "../../icons";
import WorkflowTimeline, { type WorkflowStep } from "./WorkflowTimeline";
import { workflowApi } from "../../api/workflowApi";
import { deviceApi } from "../../api/deviceApi";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import EmptyState from "../../components/ui/EmptyState";
import Modal from "../../components/ui/Modal";
import type { RobotWorkflow } from "../../types";
import { robotWorkflowApi, robotWorkflowError } from "../../api/robotWorkflowApi";
import { useT } from "../../i18n/I18nProvider";
import "./DevicesView.css";

// ─── Workflow destination progress ────────────────────────────────────────────

interface DestProgress {
  name: string;
  statusEvent: string;
  reached: boolean;
  active: boolean;
  isCap: boolean;
}

function humanise(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function resolveDestName(dest: string, dataEntry: Workflow["data_entry"]): string {
  const match = dest.match(/^\{\{destinations\[(\d+)\]\}\}$/);
  if (match) {
    const idx = parseInt(match[1], 10);
    return dataEntry.destination_names[idx] ?? dest;
  }
  return dest;
}

/**
 * Get the events belonging to the CURRENT/LATEST session in the device queue.
 * A session starts at the last "workflow_started" entry.
 * Returns a plain array of event-name strings, deduplicated, in arrival order.
 */
function getSessionEvents(device: RegisteredDevice): string[] {
  const queue = device.eventQueue ?? [];
  // Find the last workflow_started — everything from there onward is the current session.
  let startIdx = -1;
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].event === "workflow_started") { startIdx = i; break; }
  }
  const session = startIdx >= 0 ? queue.slice(startIdx) : queue;
  // Deduplicate while preserving order (backend deduplicates too, but be safe)
  const seen = new Set<string>();
  const result: string[] = [];
  for (const e of session) {
    if (!seen.has(e.event)) { seen.add(e.event); result.push(e.event); }
  }
  return result;
}

/**
 * Build a DestProgress list from the workflow definition + received event names.
 * receivedEvents is just the list of event-name strings from getSessionEvents().
 */
function buildDestProgress(workflow: Workflow, receivedEvents: string[]): DestProgress[] {
  const received = new Set(receivedEvents);
  const items: DestProgress[] = [];

  for (let i = 0; i < workflow.steps.length; i++) {
    const s = workflow.steps[i];

    if (s.type === "confirmation" && s.status_event) {
      let name = "";
      for (let j = i - 1; j >= 0; j--) {
        if (workflow.steps[j].type === "follow_me") {
          const raw = (workflow.steps[j] as FollowMeStep).destination ?? "";
          name = resolveDestName(raw, workflow.data_entry);
          break;
        }
        if (workflow.steps[j].type === "confirmation") break;
      }
      if (!name) name = s.title?.en || humanise(s.status_event);
      items.push({ name, statusEvent: s.status_event, reached: received.has(s.status_event), active: false, isCap: false });
    }

    if (s.type === "finished" && s.status_event) {
      items.push({ name: "Workflow Complete", statusEvent: s.status_event, reached: received.has(s.status_event), active: false, isCap: true });
    }
  }

  // Belt-and-suspenders: if all non-cap steps reached → cap is reached too
  const nonCap = items.filter((it) => !it.isCap);
  if (nonCap.length > 0 && nonCap.every((it) => it.reached)) {
    const capIdx = items.findIndex((it) => it.isCap);
    if (capIdx >= 0) items[capIdx].reached = true;
  }

  // Mark the first unreached step as active (blinking)
  const firstUnreached = items.findIndex((it) => !it.reached);
  if (firstUnreached >= 0) items[firstUnreached].active = true;

  return items;
}

function WorkflowDestinationFlow({ workflow, receivedEvents }: { workflow: Workflow; receivedEvents: string[] }) {
  const items = buildDestProgress(workflow, receivedEvents);
  if (!items.length) return null;

  return (
    <div className="dest-flow">
      {items.map((item, i) => (
        <>
          <div key={`node-${i}`} className="dest-flow-item">
            <div className={[
              "dest-flow-dot",
              item.isCap   ? "cap"     : "",
              item.reached ? "reached" : item.active ? "active" : "",
            ].join(" ").trim()}>
              {item.reached ? <MdCheck size={15} /> : item.isCap ? <MdFlag size={14} /> : i + 1}
            </div>
            <div className={[
              "dest-flow-label",
              item.reached ? "reached" : item.active ? "active" : "",
            ].join(" ").trim()}>
              {item.name}
            </div>
          </div>
          {i < items.length - 1 && (
            <div key={`line-${i}`} className={`dest-flow-connector${item.reached ? " reached" : ""}`} />
          )}
        </>
      ))}
    </div>
  );
}

// ─── Map destinations section (About tab) ────────────────────────────────────

function MapDestinationsSection({ destinations }: { destinations: MapDestination[] }) {
  const t = useT();

  return (
    <div className="device-detail-section">
      <h4 style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <MdMap size={16} /> Map Destinations
        {destinations.length > 0 && (
          <span className="pill pill-neutral" style={{ marginLeft: "auto", fontSize: "0.7rem" }}>
            {destinations.length}
          </span>
        )}
      </h4>
      {destinations.length === 0 ? (
        <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)", margin: 0 }}>
          {t("mapDestinationsEmpty")}
        </p>
      ) : (
        <div className="map-dest-chips">
          {destinations.map((d) => (
            <span
              key={d.name}
              className="map-dest-chip"
              title={d.x != null ? `x=${d.x}  y=${d.y}  z=${d.z ?? 0}` : undefined}
            >
              <MdLocationOn size={11} />
              <span className="map-dest-chip-name">{d.name}</span>
              {d.type && (
                <span className="map-dest-chip-type">{d.type}</span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

interface Props {
  devices: RegisteredDevice[];
  pendingRequests: DeviceRequest[];
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onUnregister: (id: string) => void;
  loadingId: string | null;
  unregisteringId: string | null;
  workflows: Workflow[];
  robotWorkflows?: RobotWorkflow[];
}

// ─── Workflow-edit acknowledgement (persisted in localStorage) ───────────────

const wfAckKey = (deviceId: string) => `acu_wf_ack_${deviceId}`;

function getWfAckedAt(deviceId: string, workflowId: string): string | null {
  try {
    const raw = localStorage.getItem(wfAckKey(deviceId));
    if (!raw) return null;
    const [id, ts] = raw.split("|");
    return id === workflowId ? (ts ?? null) : null;
  } catch { return null; }
}

function saveWfAckedAt(deviceId: string, workflowId: string, updatedAt: string): void {
  try { localStorage.setItem(wfAckKey(deviceId), `${workflowId}|${updatedAt}`); } catch {}
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

export default function DevicesView({
  devices, pendingRequests, onApprove, onDeny, onUnregister,
  loadingId, unregisteringId, workflows, robotWorkflows = [],
}: Props) {
  const t = useT();
  const isDesktop = useMediaQuery("(min-width: 900px)");
  const [selectedDevice, setSelectedDevice] = useState<RegisteredDevice | null>(null);
  const [detailTab, setDetailTab] = useState<"workflow" | "about">("workflow");
  const [pendingSheetOpen, setPendingSheetOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [robotAssignBusy, setRobotAssignBusy] = useState(false);
  const [robotAssignError, setRobotAssignError] = useState<string | null>(null);
  const [robotAssignments, setRobotAssignments] = useState<RobotWorkflow[]>([]);

  useEffect(() => {
    if (!assignModalOpen && !selectedDevice) return;
    const controller = new AbortController();
    robotWorkflowApi.getAssignments(controller.signal).then((assignments) => {
      if (!controller.signal.aborted) setRobotAssignments(assignments);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted)
        setRobotAssignError(robotWorkflowError(cause, t("robotLoadFailed")));
    });
    return () => controller.abort();
  }, [assignModalOpen, robotWorkflows, selectedDevice?.deviceId, t]);
  const [confirmUnregister, setConfirmUnregister] = useState(false);
  // Local override for optimistic assignment updates (cleared on next poll)
  const [localAssignment, setLocalAssignment] = useState<Record<string, string>>({});
  // Tracks which workflow version was acknowledged — drives the "edited" banner
  const [ackedEdits, setAckedEdits] = useState<Record<string, string>>({});

  // Load persisted workflow assignments (used only for the assign-modal "isAssigned" badge)
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  useEffect(() => {
    workflowApi.getAssignments()
      .then((a) => setAssignments(a))
      .catch(() => {/* non-critical — device.assignedWorkflowId is the source of truth */});
  }, []);

  // Keep selectedDevice in sync with the live data
  useEffect(() => {
    if (!selectedDevice) return;
    const fresh = devices.find((d) => d.id === selectedDevice.id);
    if (fresh && fresh !== selectedDevice) setSelectedDevice(fresh);
    if (!fresh) setSelectedDevice(null);
  }, [devices, selectedDevice]);

  // Reset tab + confirm state whenever a different device is opened
  useEffect(() => {
    setDetailTab("workflow");
    setConfirmUnregister(false);
    setRobotAssignError(null);
  }, [selectedDevice?.id]);

  function assignWorkflow(deviceId: string, workflowId: string) {
    // Optimistic update — device.assignedWorkflowId will confirm on next poll
    setLocalAssignment((prev) => ({ ...prev, [deviceId]: workflowId }));
    setAssignments((prev) => ({ ...prev, [deviceId]: workflowId }));
    setAssignModalOpen(false);
    // Stamp the current updatedAt so we can detect future edits
    const wf = workflows.find((w) => w.id === workflowId);
    if (wf) {
      saveWfAckedAt(deviceId, workflowId, wf.updatedAt);
      setAckedEdits((prev) => ({ ...prev, [`${deviceId}|${workflowId}`]: wf.updatedAt }));
    }
    workflowApi.setAssignment(deviceId, workflowId)
      .catch((err) => console.error("Failed to save workflow assignment", err));
  }
  function clearAssignment(deviceId: string) {
    setAssignments((prev) => {
      const next = { ...prev }; delete next[deviceId]; return next;
    });
    workflowApi.clearAssignment(deviceId)
      .catch((err) => console.error("Failed to clear workflow assignment", err));
  }

  // Use the device's own assignedWorkflowId (from the poll) as primary source.
  // Fall back to localAssignment for optimistic updates (covers the 3s before next poll).
  const assignedWorkflowId = selectedDevice
    ? (localAssignment[selectedDevice.id] ?? selectedDevice.assignedWorkflowId)
    : undefined;
  const assignedWorkflow = assignedWorkflowId
    ? workflows.find((w) => w.id === assignedWorkflowId)
    : undefined;

  const detailOpen = !!selectedDevice;
  const showList   = isDesktop || !detailOpen;
  const showDetail = isDesktop || detailOpen;

  // Workflows compatible with the selected bot's saved Pudu destinations.
  // A workflow is shown if every one of its destination names exists in the
  // bot's map. If the bot has no map yet, all workflows are shown.
  const botDestNames = new Set(
    (selectedDevice?.destinations ?? []).map((d) => d.name)
  );
  const compatibleWorkflows = workflows.filter((wf) =>
    botDestNames.size === 0 ||
    wf.data_entry.destination_names.length === 0 ||
    wf.data_entry.destination_names.every((n) => botDestNames.has(n))
  );

  return (
    <>
      <div className="section-head">
        <div>
          <h2 className="section-title">{t("registeredDevices")}</h2>
          <p className="section-subtitle">{t(devices.length === 1 ? "devicesConnectedOne" : "devicesConnectedMany", { count: devices.length })}</p>
        </div>
        <button
          type="button"
          className="icon-btn brand"
          aria-label={t("pendingApprovals")}
          onClick={() => setPendingSheetOpen(true)}
          style={{ position: "relative" }}
        >
          <MdNotifications size={22} />
          {pendingRequests.length > 0 && (
            <span style={{
              position: "absolute", top: -4, right: -4,
              background: "var(--warning)", color: "#fff",
              fontSize: "0.65rem", fontWeight: 700,
              borderRadius: "var(--radius-pill)",
              minWidth: 18, height: 18, padding: "0 5px",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              border: "2px solid var(--surface)",
            }}>{pendingRequests.length}</span>
          )}
        </button>
      </div>

      <div className={`devices ${detailOpen ? "detail-open" : ""}`}>
        {/* List ---------------------------------------------- */}
        {showList && (
          <aside className="surface-card device-list">
            <div className="device-list-header">
              <h3>{t("devicesHeading")}</h3>
              <span className="pill pill-neutral">{devices.length}</span>
            </div>
            {devices.length === 0 ? (
              <div style={{ padding: "var(--space-5)" }}>
                <EmptyState
                  icon={<MdSmartToy size={28} />}
                  title={t("noRegisteredDevices")}
                  description={t("noRegisteredDevicesDesc")}
                />
              </div>
            ) : (
              devices.map((d) => (
                <button
                  type="button"
                  key={d.id}
                  className={`device-row ${selectedDevice?.id === d.id ? "selected" : ""}`}
                  onClick={() => setSelectedDevice(d)}
                  style={{ width: "100%", textAlign: "left" }}
                >
                  <span className="icon-tile device-row-icon"><MdSmartToy size={20} /></span>
                  <div className="device-row-info">
                    <div className="device-row-name">{d.deviceName}</div>
                    <div className="device-row-meta">{d.deviceId}</div>
                  </div>
                  <span className={`online-dot ${d.isOnline ? "online" : "offline"}`} aria-label={d.isOnline ? t("online") : t("offline")} />
                </button>
              ))
            )}
          </aside>
        )}

        {/* Detail -------------------------------------------- */}
        {showDetail && (
          <section className="surface-card device-detail">
            {!selectedDevice ? (
              <div style={{ padding: "var(--space-6)" }}>
                <EmptyState
                  icon={<MdSmartToy size={32} />}
                  title={t("selectADevice")}
                  description={t("selectADeviceDesc")}
                />
              </div>
            ) : (
              <>
                {!isDesktop && (
                  <button
                    type="button"
                    className="detail-back"
                    style={{ margin: "var(--space-3) var(--space-4) 0", background: "none", border: "none" }}
                    onClick={() => setSelectedDevice(null)}
                  >
                    <MdArrowBack size={18} /> {t("backToList")}
                  </button>
                )}

                <div className="device-detail-header">
                  <div className="icon-tile device-row-icon" style={{ width: 44, height: 44 }}>
                    <MdSmartToy size={24} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 className="device-detail-title">{selectedDevice.deviceName}</h3>
                    <span className="pill pill-neutral" style={{ marginTop: 4 }}>{t("mobileRobot")}</span>
                  </div>
                  <span className={`pill ${selectedDevice.isOnline ? "pill-success" : "pill-neutral"}`}>
                    {selectedDevice.isOnline
                      ? <><MdWifi    size={13} />{t("online")}</>
                      : <><MdWifiOff size={13} />{t("offline")}</>}
                  </span>
                </div>

                {selectedDevice.paused && (
                  <div
                    className="workflow-edited-banner"
                    role="alert"
                    style={{ margin: "0 var(--space-4) var(--space-3)", borderColor: "var(--danger)", background: "var(--danger-50, #fdecec)", color: "var(--danger)" }}
                  >
                    <MdInfoOutline size={16} />
                    <span style={{ flex: 1 }}>
                      {selectedDevice.pauseReason ?? "Escort auto-paused — patient re-identification lost."}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => deviceApi.resumeEscort(selectedDevice.id).catch((e) => console.error("resume failed", e))}
                    >
                      Resume escort
                    </button>
                  </div>
                )}

                {robotAssignError && !assignModalOpen && <p role="alert">{robotAssignError}</p>}
                <div className="detail-tabs" role="tablist" aria-label={t("deviceInfo")}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={detailTab === "workflow"}
                    className={`detail-tab ${detailTab === "workflow" ? "active" : ""}`}
                    onClick={() => setDetailTab("workflow")}
                  >
                    <MdRoute size={16} /> {t("tabWorkflow")}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={detailTab === "about"}
                    className={`detail-tab ${detailTab === "about" ? "active" : ""}`}
                    onClick={() => setDetailTab("about")}
                  >
                    <MdInfoOutline size={16} /> {t("tabAbout")}
                  </button>
                </div>

                {detailTab === "workflow" && (<>
                {(() => {
                  // Derive the current-session events directly from the live event queue.
                  // No cursor, no localStorage, no timers — just slice from last workflow_started.
                  const sessionEvents = getSessionEvents(selectedDevice);
                  const timelineSteps: WorkflowStep[] = sessionEvents.map((ev) => ({
                    event: ev, receivedAt: "", confirmed: false,
                  }));
                  return (<>
                <div className="device-detail-section">
                  <h4 style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    {t("workflowProgress")}
                   {/* {assignedWorkflow && (
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        title="Re-assign the same workflow — clears backend queue for a fresh run"
                        onClick={() => assignWorkflow(selectedDevice.id, assignments[selectedDevice.id])}
                      >
                        ↺ Restart
                      </button>
                    )}*/}
                  </h4>
                  {assignedWorkflow
                    ? <WorkflowDestinationFlow
                        workflow={assignedWorkflow}
                        receivedEvents={sessionEvents}
                      />
                    : <WorkflowTimeline steps={timelineSteps} />
                  }
                </div>

                {/* ── Debug panel ── shows the raw event queue from the backend */}
                {/* <div className="device-detail-section" style={{ background: "var(--surface-raised, #f5f5f5)", borderRadius: 8, padding: "var(--space-3)" }}>
                  <h4 style={{ marginBottom: "var(--space-2)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary, #666)" }}>
                    🔬 Live Event Queue (debug)
                  </h4>
                  {(selectedDevice.eventQueue ?? []).length === 0 ? (
                    <p style={{ fontSize: "0.8rem", color: "var(--text-secondary, #888)", margin: 0 }}>Queue empty — waiting for events…</p>
                  ) : (
                    <ol style={{ margin: 0, padding: "0 0 0 1.2em", fontSize: "0.78rem", lineHeight: 1.6 }}>
                      {[...(selectedDevice.eventQueue ?? [])].reverse().slice(0, 12).map((e, i) => (
                        <li key={i} style={{ color: e.event === "workflow_completed" ? "#009999" : undefined }}>
                          <code style={{ fontWeight: 600 }}>{e.event}</code>
                          <span style={{ color: "var(--text-secondary, #999)", marginLeft: 6 }}>
                            {new Date(e.receivedAt).toLocaleTimeString()}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>  */}
                  </>);
                })()}

                <div className="device-detail-section">
                  <h4>{t("assignedWorkflow")}</h4>

                  {/* ── "Workflow was edited" banner ── */}
                  {assignedWorkflow && assignedWorkflow.updatedAt !== assignedWorkflow.createdAt && (() => {
                    const ackKey  = `${selectedDevice.id}|${assignedWorkflow.id}`;
                    const ackedAt = ackedEdits[ackKey] ?? getWfAckedAt(selectedDevice.id, assignedWorkflow.id);
                    if (ackedAt === assignedWorkflow.updatedAt) return null;
                    return (
                      <div className="workflow-edited-banner">
                        <MdEdit size={14} />
                        <span style={{ flex: 1 }}>{t("workflowEditedBanner")}</span>
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          onClick={() => {
                            saveWfAckedAt(selectedDevice.id, assignedWorkflow.id, assignedWorkflow.updatedAt);
                            setAckedEdits((prev) => ({ ...prev, [ackKey]: assignedWorkflow.updatedAt }));
                          }}
                        >
                          {t("workflowEditedDismiss")}
                        </button>
                      </div>
                    );
                  })()}
                  {assignedWorkflow ? (
                    <div className="assigned-workflow">
                      <div className="icon-tile icon-tile-on-tint assigned-workflow-icon"><MdRoute size={20} /></div>
                      <div className="assigned-workflow-info">
                        <div className="assigned-workflow-name">{assignedWorkflow.name}</div>
                        <div className="assigned-workflow-meta">
                          {t(assignedWorkflow.data_entry.destination_names.length === 1 ? "destinationsOne" : "destinationsMany", { count: assignedWorkflow.data_entry.destination_names.length })}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "var(--space-2)" }}>
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => setAssignModalOpen(true)}>
                          <MdEdit size={14} />{t("changeWorkflow")}
                        </button>
                        <button type="button" className="icon-btn" aria-label={t("removeAssignment")} onClick={() => clearAssignment(selectedDevice.id)} style={{ width: 32, height: 32 }}>
                          <MdClose size={16} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="btn btn-primary btn-block" onClick={() => setAssignModalOpen(true)}>
                      <MdAssignment size={18} />
                      {t("assignWorkflow")}
                    </button>
                  )}
                </div>
                </>)}

                {detailTab === "about" && (<>
                <div className="device-detail-section">
                  <h4>{t("deviceInfo")}</h4>
                  <div className="meta-grid">
                    <div className="meta-item"><span className="meta-label">{t("deviceId")}</span><span className="meta-value mono">{selectedDevice.deviceId}</span></div>
                    <div className="meta-item"><span className="meta-label">{t("ipAddress")}</span><span className="meta-value mono">{selectedDevice.ipAddress}</span></div>
                    <div className="meta-item"><span className="meta-label">{t("macAddress")}</span><span className="meta-value mono">{selectedDevice.macAddress}</span></div>
                    <div className="meta-item"><span className="meta-label">{t("firmware")}</span><span className="meta-value mono">{selectedDevice.firmwareVersion ?? "—"}</span></div>
                    <div className="meta-item"><span className="meta-label">{t("connected")}</span><span className="meta-value">{timeAgo(selectedDevice.connectedAt)}</span></div>
                    <div className="meta-item"><span className="meta-label">{t("lastSeen")}</span><span className="meta-value">{timeAgo(selectedDevice.lastSeen)}</span></div>
                  </div>
                </div>

                {/* ── Map Destinations ──────────────────────────────── */}
                <MapDestinationsSection destinations={selectedDevice.destinations ?? []} />

                <div className="device-detail-section">
                  <h4>{t("dangerZone")}</h4>
                  {confirmUnregister ? (
                    <div className="danger-zone">
                      <div className="danger-zone-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
                        <div className="text">
                          <div className="title">{t("unregisterConfirmTitle")}</div>
                          <div className="desc">
                            {t("unregisterConfirmDesc", { name: selectedDevice.deviceName, id: selectedDevice.deviceId })}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
                          <button type="button" className="btn btn-secondary" onClick={() => setConfirmUnregister(false)}>{t("cancel")}</button>
                          <button
                            type="button"
                            className="btn btn-danger"
                            disabled={unregisteringId === selectedDevice.id}
                            onClick={() => {
                              const id = selectedDevice.id;
                              setSelectedDevice(null);
                              setConfirmUnregister(false);
                              onUnregister(id);
                            }}
                          >
                            <MdLinkOff size={14} />
                            {unregisteringId === selectedDevice.id ? t("removing") : t("unregister")}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="danger-zone">
                      <div className="danger-zone-row">
                        <div className="text">
                          <div className="title">{t("unregisterDevice")}</div>
                          <div className="desc">{t("unregisterDesc")}</div>
                        </div>
                        <button type="button" className="btn btn-danger-outline" onClick={() => setConfirmUnregister(true)}>
                          <MdLinkOff size={15} /> {t("unregister")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                </>)}
              </>
            )}
          </section>
        )}
      </div>

      {/* Pending approvals — bottom sheet / dialog */}
      <Modal
        open={pendingSheetOpen}
        title={t("pendingApprovals")}
        onClose={() => setPendingSheetOpen(false)}
        maxWidth={480}
      >
        {pendingRequests.length === 0 ? (
          <EmptyState
            icon={<MdCheckCircle size={32} />}
            title={t("allClear")}
            description={t("noPendingRequests")}
          />
        ) : (
          <ul className="pending-list">
            {pendingRequests.map((req) => (
              <li key={req.id} className="pending-row">
                <span className="icon-tile device-row-icon"><MdSmartToy size={18} /></span>
                <div className="info">
                  <div className="name">{req.deviceName}</div>
                  <div className="meta">{req.deviceId} · {req.ipAddress}</div>
                </div>
                <div className="actions">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t("deny")}
                    style={{ color: "var(--danger)", borderColor: "var(--danger-border)" }}
                    disabled={loadingId === req.id}
                    onClick={() => onDeny(req.id)}
                  ><MdClose size={16} /></button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t("approve")}
                    style={{ color: "var(--success)", borderColor: "var(--success-border)" }}
                    disabled={loadingId === req.id}
                    onClick={() => onApprove(req.id)}
                  ><MdCheck size={16} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {/* Assign workflow modal */}
      <Modal
        open={assignModalOpen && !!selectedDevice}
        title={selectedDevice ? t("assignWorkflowFor", { name: selectedDevice.deviceName }) : t("assignWorkflow")}
        onClose={() => setAssignModalOpen(false)}
        maxWidth={600}
      >
        {robotAssignError && <p role="alert">{robotAssignError}</p>}
        {workflows.length + robotWorkflows.length === 0 ? (
          <EmptyState
            icon={<MdRoute size={32} />}
            title={t("noWorkflowsAvail")}
            description={t("noWorkflowsAvailDesc")}
          />
        ) : (
          <>
            {botDestNames.size > 0 && (
              <p className="field-hint" style={{ marginBottom: "var(--space-3)" }}>
                {t("wfCompatibleHint", { count: compatibleWorkflows.length, total: workflows.length })}
              </p>
            )}
            {compatibleWorkflows.length + robotWorkflows.length === 0 ? (
              <EmptyState
                icon={<MdRoute size={28} />}
                title={t("noWorkflowsAvail")}
                description={t("wfNoCompatible")}
              />
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                {compatibleWorkflows.map((wf) => {
                  const isAssigned = selectedDevice && assignments[selectedDevice.id] === wf.id;
                  return (
                    <li
                      key={wf.id}
                      className="card is-interactive"
                      style={{
                        padding: "var(--space-3) var(--space-4)",
                        display: "flex", alignItems: "center", gap: "var(--space-3)",
                        borderColor: isAssigned ? "var(--brand)" : undefined,
                        background: isAssigned ? "var(--brand-50)" : undefined,
                      }}
                      onClick={() => selectedDevice && assignWorkflow(selectedDevice.id, wf.id)}
                    >
                      <div className="icon-tile device-row-icon"><MdRoute size={20} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: "var(--fs-base)" }}>{wf.name}</div>
                        {wf.description && <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)" }}>{wf.description}</div>}
                        <div className="workflow-chain">
                          {wf.data_entry.destination_names.map((name, i) => (
                            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <span className="workflow-chip"><MdLocationOn size={11} />{name}</span>
                              {i < wf.data_entry.destination_names.length - 1 && <span className="arrow">→</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                      {isAssigned ? (
                        <span className="pill pill-success"><MdCheck size={14} />{t("assigned")}</span>
                      ) : (
                        <span className="pill pill-brand">{t("assign")}</span>
                      )}
                    </li>
                  );
                })}
                {robotWorkflows.map((wf) => {
                  const isAssigned = robotAssignments.some((workflow) =>
                    workflow.RobotId === selectedDevice?.deviceId && workflow.WorkflowID === wf.WorkflowID);
                  return (
                  <li key={`pwa-${wf.WorkflowID}`} className="card is-interactive"
                    style={{ padding: "var(--space-3) var(--space-4)", display: "flex",
                      alignItems: "center", gap: "var(--space-3)" }}>
                    <div className="icon-tile device-row-icon"><MdRoute size={20} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: "var(--fs-base)" }}>
                        {wf.WorkflowName} {t("robotSchema")}
                      </div>
                      {wf.Description && <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)" }}>
                        {wf.Description}
                      </div>}
                    </div>
                    <button type="button" className={`pill ${isAssigned ? "pill-success" : "pill-brand"}`}
                      disabled={robotAssignBusy || isAssigned}
                      onClick={async () => {
                        if (!selectedDevice || robotAssignBusy) return;
                        setRobotAssignBusy(true);
                        setRobotAssignError(null);
                        try {
                          await robotWorkflowApi.publish(wf.WorkflowID, selectedDevice.deviceId);
                          setRobotAssignments(await robotWorkflowApi.getAssignments());
                        } catch (cause) {
                          setRobotAssignError(robotWorkflowError(cause, t("robotActionFailed")));
                        } finally { setRobotAssignBusy(false); }
                      }}>{isAssigned ? <><MdCheck size={14} />{t("assigned")}</> : t("robotAssign")}</button>
                  </li>
                ); })}
              </ul>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
