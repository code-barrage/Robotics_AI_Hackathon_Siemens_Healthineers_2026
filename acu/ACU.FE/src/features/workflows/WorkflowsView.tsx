import { useEffect, useState, type ReactNode } from "react";
import type { Workflow, WorkflowStep, LocalizedString, RegisteredDevice } from "../../types";
import {
  MdAdd, MdEdit, MdDelete, MdRoute, MdSave,
  MdKeyboardArrowDown, MdRemoveCircleOutline, MdDirectionsWalk,
  MdFactCheck, MdMovie, MdFlag, MdLocationOn, MdSmartToy,
} from "../../icons";
import EmptyState from "../../components/ui/EmptyState";
import Modal from "../../components/ui/Modal";
import { workflowApi } from "../../api/workflowApi";
import { useT } from "../../i18n/I18nProvider";
import type { Dict } from "../../i18n/en";
import "./WorkflowsView.css";

// ─── helpers ──────────────────────────────────────────────────────────────────

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

type StepType = WorkflowStep["type"];

function stepIcon(type: StepType) {
  switch (type) {
    case "follow_me":      return <MdDirectionsWalk size={13} />;
    case "confirmation":   return <MdFactCheck size={13} />;
    case "video_playback": return <MdMovie size={13} />;
    case "finished":       return <MdFlag size={13} />;
  }
}

function stepTypeKey(type: StepType): keyof Dict {
  switch (type) {
    case "confirmation":   return "stepConfirmation";
    case "follow_me":      return "stepFollowMe";
    case "video_playback": return "stepVideoPlayback";
    case "finished":       return "stepFinished";
  }
}

function stepSummary(s: WorkflowStep): string {
  switch (s.type) {
    case "confirmation":   return s.title?.en ?? "";
    case "follow_me":      return s.destination ?? "";
    case "video_playback": return s.video;
    case "finished":       return s.status_event ?? "";
  }
}

const destLabel = (cat: string) => cat;

// ─── form state ───────────────────────────────────────────────────────────────

interface LocForm { en: string; de: string; }
const emptyLoc = (): LocForm => ({ en: "", de: "" });
const toLoc = (f: LocForm): LocalizedString | undefined =>
  f.en || f.de ? { en: f.en, de: f.de || undefined } : undefined;
const fromLoc = (l?: LocalizedString): LocForm => ({ en: l?.en ?? "", de: l?.de ?? "" });

interface ConfirmForm  { id: string; type: "confirmation";   title: LocForm; text: LocForm; button_text: LocForm; tts: string; status_event: string; can_go_back: boolean; }
interface FollowMeForm { id: string; type: "follow_me";      title: LocForm; subtitle: LocForm; destination: string; duration_ms: number; }
interface VideoForm    { id: string; type: "video_playback"; video: string; }
interface FinishedForm { id: string; type: "finished";       status_event: string; }
type StepForm = ConfirmForm | FollowMeForm | VideoForm | FinishedForm;

interface DestEntry { id: string; category: string; name: string; }

function newStepForm(type: StepType): StepForm {
  const id = uid();
  switch (type) {
    case "confirmation":   return { id, type, title: emptyLoc(), text: emptyLoc(), button_text: emptyLoc(), tts: "", status_event: "", can_go_back: false };
    case "follow_me":      return { id, type, title: emptyLoc(), subtitle: emptyLoc(), destination: "", duration_ms: 0 };
    case "video_playback": return { id, type, video: "" };
    case "finished":       return { id, type, status_event: "workflow_completed" };
  }
}

/** The mandatory first step pre-loaded on every new workflow. */
function defaultPatientStep(): ConfirmForm {
  return {
    id:           uid(),
    type:         "confirmation",
    title:        { en: "Patient Identification", de: "" },
    text:         { en: "Please confirm your identity.", de: "" },
    button_text:  { en: "Confirm", de: "" },
    tts:          "",
    status_event: "patient_is_identified",
    can_go_back:  false,
  };
}

function formToStep(s: StepForm): WorkflowStep {
  switch (s.type) {
    case "confirmation":   return { type: "confirmation",   title: toLoc(s.title), text: toLoc(s.text), button_text: toLoc(s.button_text), tts: s.tts || undefined, status_event: s.status_event || undefined, can_go_back: s.can_go_back || undefined };
    case "follow_me":      return { type: "follow_me",      title: toLoc(s.title), subtitle: toLoc(s.subtitle), destination: s.destination || undefined, duration_ms: s.duration_ms };
    case "video_playback": return { type: "video_playback", video: s.video };
    case "finished":       return { type: "finished",       status_event: s.status_event || undefined };
  }
}

function stepToForm(s: WorkflowStep): StepForm {
  const id = uid();
  switch (s.type) {
    case "confirmation":   return { id, type: "confirmation",   title: fromLoc(s.title), text: fromLoc(s.text), button_text: fromLoc(s.button_text), tts: s.tts ?? "", status_event: s.status_event ?? "", can_go_back: s.can_go_back ?? false };
    case "follow_me":      return { id, type: "follow_me",      title: fromLoc(s.title), subtitle: fromLoc(s.subtitle), destination: s.destination ?? "", duration_ms: s.duration_ms };
    case "video_playback": return { id, type: "video_playback", video: s.video };
    case "finished":       return { id, type: "finished",       status_event: s.status_event ?? "workflow_completed" };
  }
}

// ─── sub-components ───────────────────────────────────────────────────────────

function LocField({ label, value, onChange }: { label: string; value: LocForm; onChange: (v: LocForm) => void }) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
        <input className="input" placeholder="EN" value={value.en} onChange={(e) => onChange({ ...value, en: e.target.value })} />
        <input className="input" placeholder="DE" value={value.de} onChange={(e) => onChange({ ...value, de: e.target.value })} />
      </div>
    </div>
  );
}

function StepFields({ step, onChange, destinations }: {
  step:         StepForm;
  onChange:     (patch: Record<string, unknown>) => void;
  destinations: DestEntry[];
}) {
  const t = useT();

  if (step.type === "confirmation") return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginTop: "var(--space-2)" }}>
      <LocField label={t("fieldTitle")}      value={step.title}       onChange={(v) => onChange({ title: v })} />
      <LocField label={t("fieldText")}       value={step.text}        onChange={(v) => onChange({ text: v })} />
      <LocField label={t("fieldButtonText")} value={step.button_text} onChange={(v) => onChange({ button_text: v })} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
        <div className="field">
          <label className="field-label">{t("fieldTts")}</label>
          <select className="select" value={step.tts} onChange={(e) => onChange({ tts: e.target.value })}>
            <option value="">{t("ttsNone")}</option>
            <option value="single">{t("ttsSingle")}</option>
            <option value="repeat_infinite">{t("ttsRepeatInfinite")}</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label">{t("fieldStatusEvent")}</label>
          <input className="input" value={step.status_event} placeholder="e.g. patient_is_identified" onChange={(e) => onChange({ status_event: e.target.value })} />
        </div>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--fs-sm)", cursor: "pointer" }}>
        <input type="checkbox" checked={step.can_go_back} onChange={(e) => onChange({ can_go_back: e.target.checked })} />
        {t("fieldCanGoBack")}
      </label>
    </div>
  );

  if (step.type === "follow_me") return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginTop: "var(--space-2)" }}>
      <LocField label={t("fieldTitle")}    value={step.title}    onChange={(v) => onChange({ title: v })} />
      <LocField label={t("fieldSubtitle")} value={step.subtitle} onChange={(v) => onChange({ subtitle: v })} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
        <div className="field">
          <label className="field-label">{t("destination")}</label>
          <select
            className="select"
            value={step.destination}
            onChange={(e) => onChange({ destination: e.target.value })}
          >
            <option value="">— select destination —</option>
            {destinations.map((d) => {
              const label   = d.name.trim() || destLabel(d.category);
              const display = label + (d.category ? ` (${d.category})` : "");
              return (
                <option key={d.id} value={label}>
                  {display}
                </option>
              );
            })}
          </select>
        </div>
        <div className="field">
          <label className="field-label">{t("fieldDurationMs")}</label>
          <input
            className="input"
            inputMode="numeric"
            placeholder="0"
            value={step.duration_ms === 0 ? "" : step.duration_ms}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "");
              onChange({ duration_ms: digits === "" ? 0 : Number(digits) });
            }}
          />
        </div>
      </div>
    </div>
  );

  if (step.type === "video_playback") return (
    <div className="field" style={{ marginTop: "var(--space-2)" }}>
      <label className="field-label">{t("videoName")}</label>
      <input className="input" value={step.video} placeholder="e.g. intro_video" onChange={(e) => onChange({ video: e.target.value })} />
    </div>
  );

  if (step.type === "finished") return (
    <div className="field" style={{ marginTop: "var(--space-2)" }}>
      <label className="field-label">{t("fieldStatusEvent")}</label>
      <input className="input" value={step.status_event} placeholder="e.g. workflow_completed" onChange={(e) => onChange({ status_event: e.target.value })} />
    </div>
  );

  return null;
}

// ─── main component ───────────────────────────────────────────────────────────

interface Props {
  workflows: Workflow[];
  devices:   RegisteredDevice[];
  onSave:    (workflow: Workflow) => void;
  onDelete:  (id: string) => void;
  additionalWorkflows?: ReactNode;
  additionalWorkflowCount?: number;
}

export default function WorkflowsView({ workflows, devices, onSave, onDelete,
  additionalWorkflows, additionalWorkflowCount = 0 }: Props) {
  const t = useT();
  const [formOpen,     setFormOpen]     = useState(false);
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [name,         setName]         = useState("");
  const [description,  setDescription]  = useState("");
  const [targetDevice, setTargetDevice] = useState("");
  const [destinations, setDestinations] = useState<DestEntry[]>([]);
  const [steps,        setSteps]        = useState<StepForm[]>([]);
  const [error,        setError]        = useState<string | null>(null);
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set());

  // device→workflow assignments (deviceId → workflowId). Loaded so the form can
  // pre-select the bot a workflow is already assigned to, and reflect changes
  // back after save. The Devices tab remains the canonical place to manage these.
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  useEffect(() => {
    workflowApi.getAssignments()
      .then(setAssignments)
      .catch(() => {/* non-critical — assignment is optional */});
  }, []);

  /** The id of the (first) device this workflow is currently assigned to, if any. */
  function deviceAssignedTo(workflowId: string): string {
    return Object.keys(assignments).find((d) => assignments[d] === workflowId) ?? "";
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function resetForm() {
    setName(""); setDescription(""); setTargetDevice("");
    setDestinations([]);
    setSteps([defaultPatientStep()]); setEditingId(null); setError(null);
  }
  function openCreate() { resetForm(); setFormOpen(true); }
  function openEdit(wf: Workflow) {
    setEditingId(wf.id); setName(wf.name); setDescription(wf.description);
    setTargetDevice(deviceAssignedTo(wf.id));
    const names = wf.data_entry.destination_names;
    const selected = devices.find((d) => d.id === deviceAssignedTo(wf.id));
    const botDestinations = selected?.destinations ?? [];
    setDestinations(botDestinations.map((d) => ({ id: uid(), category: d.type, name: d.name })));
    setSteps(wf.steps.map(stepToForm).map((s) => {
      // Convert legacy {{destinations[N]}} template strings to plain display names
      if (s.type === "follow_me") {
        const m = s.destination.match(/^\{\{destinations\[(\d+)\]\}\}$/);
        if (m) {
          const idx = parseInt(m[1], 10);
          return { ...s, destination: names[idx] ?? s.destination };
        }
      }
      return s;
    }));
    setError(null); setFormOpen(true);
  }
  function closeForm() { setFormOpen(false); resetForm(); }

  function addDestination()                                 { setDestinations((p) => [...p, { id: uid(), category: botCategories[0] ?? "", name: "" }]); }
  function removeDestination(id: string)                    { setDestinations((p) => p.length <= 1 ? p : p.filter((d) => d.id !== id)); }
  function updateDestCategory(id: string, category: string) { setDestinations((p) => p.map((d) => d.id === id ? { ...d, category } : d)); }
  function updateDestName(id: string, name: string)         { setDestinations((p) => p.map((d) => d.id === id ? { ...d, name } : d)); }

  /** Pick a destination from the bot's Pudu map — sets both name and type. */
  function selectBotDestination(id: string, destName: string) {
    const dest = botDests.find((d) => d.name === destName);
    setDestinations((p) => p.map((d) =>
      d.id === id ? { ...d, name: destName, category: dest?.type ?? "" } : d
    ));
  }

  function selectBot(deviceId: string) {
    setTargetDevice(deviceId);
    const selected = devices.find((d) => d.id === deviceId);
    const botDestinations = selected?.destinations ?? [];
    if (botDestinations.length > 0) {
      setDestinations(botDestinations.map((d) => ({
        id: uid(),
        category: d.type,
        name: d.name,
      })));
    } else {
      setDestinations([]);
    }
  }

  /** Derive the auto-event for a confirmation step given its position in a list. */
  function autoEvent(list: StepForm[], insertAfterIdx: number): string {
    // Walk backward; first follow_me wins, another confirmation stops the search.
    for (let j = insertAfterIdx; j >= 0; j--) {
      if (list[j].type === "follow_me") {
        const dest = (list[j] as FollowMeForm).destination ?? "";
        return dest ? `reached_${dest.toLowerCase().replace(/\s+/g, "_")}` : "";
      }
      if (list[j].type === "confirmation") break;
    }
    return "";
  }

  function addStep() {
    setSteps((prev) => {
      const step = newStepForm("confirmation") as ConfirmForm;
      step.status_event = autoEvent(prev, prev.length - 1);
      return [...prev, step];
    });
  }

  function removeStep(id: string) { setSteps((p) => p.filter((s) => s.id !== id)); }

  function changeStepType(id: string, type: StepType) {
    setSteps((prev) => {
      const idx     = prev.findIndex((s) => s.id === id);
      const newStep = { ...newStepForm(type), id } as StepForm;
      if (type === "confirmation" && idx > 0) {
        (newStep as ConfirmForm).status_event = autoEvent(prev, idx - 1);
      }
      return prev.map((s) => s.id === id ? newStep : s);
    });
  }
  function updateStep(id: string, patch: Record<string, unknown>) {
    setSteps((prev) => {
      const updated = prev.map((s) => s.id === id ? { ...s, ...patch } as StepForm : s);
      // When a follow_me destination is picked → auto-derive status_event on the
      // very next confirmation step so the bot knows exactly what event to fire.
      // e.g. "Changing Room" → "reached_changing_room"
      if ("destination" in patch) {
        const idx = updated.findIndex((s) => s.id === id);
        if (idx >= 0 && updated[idx].type === "follow_me") {
          const destName = (patch.destination as string) ?? "";
          const autoEvt  = destName
            ? `reached_${destName.toLowerCase().replace(/\s+/g, "_")}`
            : "";
          for (let j = idx + 1; j < updated.length; j++) {
            if (updated[j].type === "follow_me") break;
            if (updated[j].type === "confirmation") {
              updated[j] = { ...updated[j], status_event: autoEvt } as StepForm;
              break;
            }
          }
        }
      }
      return updated;
    });
  }

  function handleSave() {
    if (!name.trim()) { setError(t("errWorkflowNameRequired")); return; }
    if (!steps.some((s) => s.type === "finished")) { setError(t("errNoFinishedStep")); return; }
    const now       = new Date().toISOString();
    const existing  = editingId ? workflows.find((w) => w.id === editingId) : null;
    const workflow: Workflow = {
      id:          editingId ?? uid(),
      name:        name.trim(),
      description: description.trim(),
      data_entry:  {
        destination_categories: destinations.map((d) => d.category),
        destination_names:      destinations.map((d) => d.name.trim() || destLabel(d.category)),
      },
      steps:       steps.map(formToStep),
      createdAt:   existing?.createdAt ?? now,
      updatedAt:   now,
    };
    onSave(workflow);
    syncAssignment(workflow.id);
    closeForm();
  }

  /**
   * Reconcile the bot selected in the form with the persisted assignment for
   * this workflow: assign the chosen bot, or clear the previous one if the
   * user picked "Assign later". Updates are optimistic; the Devices tab and the
   * next poll confirm the canonical state.
   */
  function syncAssignment(workflowId: string) {
    const prevDevice = deviceAssignedTo(workflowId);
    if (targetDevice === prevDevice) return;

    setAssignments((prev) => {
      const next = { ...prev };
      if (prevDevice) delete next[prevDevice];
      if (targetDevice) next[targetDevice] = workflowId;
      return next;
    });

    if (targetDevice) {
      workflowApi.setAssignment(targetDevice, workflowId)
        .catch((err) => console.error("Failed to assign workflow to bot", err));
    } else if (prevDevice) {
      workflowApi.clearAssignment(prevDevice)
        .catch((err) => console.error("Failed to clear workflow assignment", err));
    }
  }

  // Derived: the currently selected bot and its persisted Pudu destinations
  const botDevice = targetDevice ? (devices.find((d) => d.id === targetDevice) ?? null) : null;
  const botDests  = botDevice?.destinations ?? [];
  const botCategories = [...new Set(botDests.map((d) => d.type).filter(Boolean))];

  return (
    <>
      <div className="section-head">
        <div>
          <h2 className="section-title">{t("workflowsTitle")}</h2>
          <p className="section-subtitle">{t("workflowsSubtitle")}</p>
        </div>
      </div>

      {workflows.length + additionalWorkflowCount === 0 && (
        <EmptyState icon={<MdRoute size={32} />} title={t("noWorkflowsYet")} description={t("noWorkflowsYetDesc")} />
      )}
        <ul className="workflow-list">
          {workflows.map((wf) => {
            const isOpen    = expanded.has(wf.id);
            const destCount = wf.data_entry.destination_names.length;
            return (
              <li key={wf.id} className={`surface-card workflow-card ${isOpen ? "open" : ""}`}>
                <button type="button" className="workflow-card-head" aria-expanded={isOpen} onClick={() => toggleExpand(wf.id)}>
                  <div className="icon-tile icon-tile-lg workflow-card-icon"><MdRoute size={20} /></div>
                  <div className="workflow-card-info">
                    <h3 className="workflow-card-name">{wf.name}</h3>
                    {wf.description && <p className="workflow-card-desc">{wf.description}</p>}
                  </div>
                  <MdKeyboardArrowDown size={24} className="workflow-card-chevron" />
                </button>

                {isOpen && (
                  <div className="workflow-card-body">
                    <div className="workflow-card-badges">
                      <span className="pill pill-neutral">{t("wfDestinationsCount", { count: destCount })}</span>
                      <span className="pill pill-neutral">{t("wfStepsCount", { count: wf.steps.length })}</span>
                    </div>

                    {destCount > 0 && (
                      <div style={{ marginBottom: "var(--space-3)" }}>
                        <p className="workflow-section-label">{t("destinationsLabel")}</p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                          {wf.data_entry.destination_names.map((name, i) => (
                            <span key={i} className="workflow-step">
                              <span className="icon"><MdLocationOn size={12} /></span>
                              {name || destLabel(wf.data_entry.destination_categories[i])}
                              {name && wf.data_entry.destination_categories[i] && (
                                <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "var(--fs-xs)", marginLeft: 3 }}>
                                  {wf.data_entry.destination_categories[i]}
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="workflow-flow">
                      {wf.steps.map((s, i) => {
                        const summary = stepSummary(s);
                        return (
                          <div key={i} className="workflow-flow-row">
                            <div className="workflow-rail">
                              <span className="workflow-rail-dot">{i + 1}</span>
                              {i < wf.steps.length - 1 && <span className="workflow-rail-line" />}
                            </div>
                            <div className="workflow-flow-content">
                              <span className="workflow-step">
                                <span className="icon">{stepIcon(s.type)}</span>
                                {t(stepTypeKey(s.type))}
                                {summary && (
                                  <span style={{ color: "var(--text-muted)", fontWeight: 400, marginLeft: 4 }}>
                                    {summary}
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="workflow-card-actions">
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => openEdit(wf)}>
                        <MdEdit size={16} /> {t("edit")}
                      </button>
                      <button type="button" className="btn btn-sm btn-danger-outline" onClick={() => onDelete(wf.id)}>
                        <MdDelete size={16} /> {t("delete")}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
          {additionalWorkflows}
        </ul>

      <button type="button" className="fab" aria-label={t("createWorkflowAria")} title={t("createWorkflowAria")} onClick={openCreate}>
        <MdAdd size={28} />
      </button>

      <Modal
        open={formOpen}
        title={editingId ? t("editWorkflow") : t("createWorkflow")}
        onClose={closeForm}
        maxWidth={740}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={closeForm}>{t("cancel")}</button>
            <button type="button" className="btn btn-primary" onClick={handleSave}>
              <MdSave size={16} />
              {editingId ? t("saveChanges") : t("createWorkflowBtn")}
            </button>
          </>
        }
      >
        <div className="workflow-form">
          <div className="field">
            <label className="field-label">{t("fieldName")}</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("fieldNamePlaceholder")} />
          </div>

          <div className="field">
            <label className="field-label">{t("fieldDescription")}</label>
            <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("fieldDescPlaceholder")} />
          </div>

          {/* ── Assign to bot (optional) ── */}
          <div className="field">
            <label className="field-label">
              <MdSmartToy size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />
              {t("fieldAssignBot")}
            </label>
            <select
              className="select"
              value={targetDevice}
              onChange={(e) => selectBot(e.target.value)}
              disabled={devices.length === 0}
            >
              <option value="">{t("assignBotNone")}</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.deviceName} ({d.deviceId})
                </option>
              ))}
            </select>
            <p className="field-hint">
              {devices.length === 0 ? t("assignBotNoDevices") : t("assignBotHint")}
            </p>
          </div>

          {/* ── Destinations ── */}
          <div>
            <p className="workflow-section-label">{t("destinationsLabel")}</p>

            {botDevice && botDests.length === 0 && (
              <p className="field-hint" style={{ marginBottom: "var(--space-2)" }}>
                {t("destNoBotDestinations")}
              </p>
            )}

            <div className="workflow-builder">
              {destinations.map((d, i) => (
                <div key={d.id} className="workflow-destination-block">
                  <div className="workflow-destination-head">
                    <span className="workflow-destination-number">{i + 1}</span>
                    <span style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>{t("destination")} {i + 1}</span>
                    <button
                      type="button"
                      className="icon-btn"
                      style={{ width: 30, height: 30, marginLeft: "auto" }}
                      disabled={destinations.length <= 1}
                      aria-label={t("removeDestination")}
                      onClick={() => removeDestination(d.id)}
                    >
                      <MdRemoveCircleOutline size={18} />
                    </button>
                  </div>

                  {/* Bot has destinations → single "Destination" select */}
                  {botDests.length > 0 ? (
                    <div className="field">
                      <label className="field-label">{t("destination")}</label>
                      <select
                        className="select"
                        value={d.name}
                        onChange={(e) => selectBotDestination(d.id, e.target.value)}
                      >
                        <option value="">— {t("destination")} —</option>
                        {botDests.map((bd, j) => (
                          <option key={j} value={bd.name}>
                            {bd.name}{bd.type ? ` (${bd.type})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    /* No bot destinations → manual category + name */
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)" }}>
                      <div className="field">
                        <label className="field-label">{t("destCategory")}</label>
                        <select className="select" value={d.category} onChange={(e) => updateDestCategory(d.id, e.target.value)}>
                          {botCategories.map((category) => (
                            <option key={category} value={category}>{category}</option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label className="field-label">{t("destDisplayName")}</label>
                        <input
                          className="input"
                          value={d.name}
                          onChange={(e) => updateDestName(d.id, e.target.value)}
                          placeholder={destLabel(d.category)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <button type="button" className="workflow-add-destination" onClick={addDestination} disabled={botCategories.length === 0}>
                <MdAdd size={18} /> {t("addDestination")}
              </button>
            </div>
          </div>

          {/* ── Steps ── */}
          <div>
            <p className="workflow-section-label">{t("stepsLabel")}</p>
            <div className="workflow-builder">
              {steps.map((s, i) => (
                <div key={s.id} className="workflow-destination-block">
                  <div className="workflow-destination-head">
                    <span className="workflow-destination-number">{i + 1}</span>
                    <select
                      className="select"
                      style={{ flex: 1 }}
                      value={s.type}
                      onChange={(e) => changeStepType(s.id, e.target.value as StepType)}
                    >
                      <option value="confirmation">{t("stepConfirmation")}</option>
                      <option value="follow_me">{t("stepFollowMe")}</option>
                      <option value="video_playback">{t("stepVideoPlayback")}</option>
                      <option value="finished">{t("stepFinished")}</option>
                    </select>
                    <button
                      type="button"
                      className="icon-btn"
                      style={{ width: 30, height: 30 }}
                      aria-label={t("removeStep")}
                      onClick={() => removeStep(s.id)}
                    >
                      <MdRemoveCircleOutline size={18} />
                    </button>
                  </div>
                  <StepFields
                    step={s}
                    onChange={(patch) => updateStep(s.id, patch)}
                    destinations={
                      botDests.length > 0
                        ? botDests.map((bd) => ({ id: bd.name, category: bd.type ?? "", name: bd.name }))
                        : destinations
                    }
                  />
                </div>
              ))}
              <button type="button" className="workflow-add-destination" onClick={addStep}>
                <MdAdd size={18} /> {t("addStep")}
              </button>
            </div>
          </div>

          {error && <div className="workflow-error">{error}</div>}
        </div>
      </Modal>
    </>
  );
}