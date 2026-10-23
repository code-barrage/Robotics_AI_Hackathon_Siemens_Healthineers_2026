import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MdAdd, MdSave, MdRemoveCircleOutline, MdRoute, MdKeyboardArrowDown, MdEdit, MdDelete } from "../../../icons";
import Modal from "../../../components/ui/Modal";
import { robotWorkflowApi, robotWorkflowError } from "../../../api/robotWorkflowApi";
import { workflowApi } from "../../../api/workflowApi";
import { useT } from "../../../i18n/I18nProvider";
import type { RegisteredDevice, RobotWorkflow } from "../../../types";
import DestinationField from "./DestinationField";
import ScreenSelect from "../ScreenSelect";
import "./RobotWorkflowsView.css";

type ButtonAction = "Next" | "Previous";
type RobotStep = RobotWorkflow["Steps"][number];
type RobotMedia = NonNullable<RobotStep["Video"]>[number];
type RobotButtons = NonNullable<RobotStep["Buttons"]>;
type MediaKind = "Video" | "Audio" | "Image";
const mediaKinds: MediaKind[] = ["Video", "Audio", "Image"];
const mediaPathKeys = { Video: "VideoPath", Audio: "AudioPath", Image: "ImagePath" } as const;
const uid = () => typeof crypto !== "undefined" && crypto.randomUUID
  ? crypto.randomUUID() : Math.random().toString(36).slice(2);
const twoColumns = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" } as const;
const defaultButtons: RobotButtons = { Yes: { Label: "Yes", Action: "Next" }, No: { Label: "No", Action: "Previous" } };

export default function RobotWorkflowsView({ workflows, devices, onChanged, creating, onCloseCreate }: {
  workflows: RobotWorkflow[]; devices: RegisteredDevice[]; onChanged: () => Promise<void>;
  creating: boolean; onCloseCreate: () => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<RobotWorkflow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  async function act(operation: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try { await operation(); await onChanged(); }
    catch (cause) { setError(robotWorkflowError(cause, t("robotActionFailed"))); }
    finally { lock.current = false; setBusy(false); }
  }
  function closeForm() {
    if (busy) return;
    setEditing(null);
    setError(null);
    onCloseCreate();
  }
  return <>
    {error && !editing && !creating && <li role="alert">{error}</li>}
    {workflows.map((workflow) => {
      const open = expanded.has(workflow.WorkflowID);
      return <li key={`pwa-${workflow.WorkflowID}`} className={`surface-card workflow-card ${open ? "open" : ""}`}>
        <button type="button" className="workflow-card-head" aria-expanded={open} onClick={() =>
          setExpanded((current) => {
            const next = new Set(current);
            if (next.has(workflow.WorkflowID)) next.delete(workflow.WorkflowID);
            else next.add(workflow.WorkflowID);
            return next;
          })}>
          <div className="icon-tile icon-tile-lg workflow-card-icon"><MdRoute size={20} /></div>
          <div className="workflow-card-info">
            <h3 className="workflow-card-name">{workflow.WorkflowName} {t("robotSchema")}</h3>
            {workflow.Description && <p className="workflow-card-desc">{workflow.Description}</p>}
          </div>
          <MdKeyboardArrowDown size={24} className="workflow-card-chevron" />
        </button>
        {open && <div className="workflow-card-body">
          <div className="workflow-card-badges">
            <span className="pill pill-neutral">{t("wfStepsCount", { count: workflow.Steps.length })}</span>
          </div>
          <div className="workflow-flow">
            {workflow.Steps.map((step, index) => <div className="workflow-flow-row" key={step.StepId}>
              <div className="workflow-rail"><span className="workflow-rail-dot">{index + 1}</span>
                {index < workflow.Steps.length - 1 && <span className="workflow-rail-line" />}</div>
              <div className="workflow-flow-content"><span className="workflow-step">{step.Title?.trim() || step.ScreenId}</span></div>
            </div>)}
          </div>
          <div className="workflow-card-actions">
            <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
              onClick={() => { setError(null); setEditing(workflow); }}>
              <MdEdit size={16} /> {t("edit")}
            </button>
            <button type="button" className="btn btn-sm btn-danger-outline" disabled={busy}
              onClick={() => void act(() => robotWorkflowApi.remove(workflow.WorkflowID))}>
              <MdDelete size={16} /> {t("delete")}
            </button>
          </div>
        </div>}
      </li>;
    })}
    {(creating || editing) && createPortal(<RobotWorkflowForm key={creating ? "create" : editing!.WorkflowID}
      workflow={creating ? null : editing} devices={devices} busy={busy} error={error}
      onClose={closeForm} onSave={(workflow) => act(async () => {
        if (creating) await workflowApi.createRobotWorkflow(workflow);
        else await robotWorkflowApi.update(workflow);
        setEditing(null);
        onCloseCreate();
      })} />, document.body)}
  </>;
}

function movementOnlyStep(step: RobotStep): RobotStep {
  if (step.ScreenId !== "FollowMe") return step;
  return { StepId: step.StepId, ScreenId: step.ScreenId, TTS: step.TTS,
    StartDestinationName: step.StartDestinationName, NextDestinationName: step.NextDestinationName };
}

function movementOnlyWorkflow(workflow: RobotWorkflow): RobotWorkflow {
  return { ...workflow, Steps: workflow.Steps.map(movementOnlyStep) };
}

function validRobotDestinations(workflow: RobotWorkflow, device: RegisteredDevice | undefined): boolean {
  if (!device || device.deviceId !== workflow.RobotId) return false;
  const names = new Set((device.destinations ?? []).map((destination) => destination.name));
  return workflow.Steps.every((step) => [step.StartDestinationName, step.NextDestinationName]
    .every((name) => !name || names.has(name)));
}

function validRobotWorkflow(workflow: RobotWorkflow): boolean {
  const hasText = (value: string | undefined) => Boolean(value?.trim());
  const validButtons = (buttons: RobotButtons | undefined) =>
    !buttons || [buttons.Yes, buttons.No].every((button) =>
      button && hasText(button.Label) && ["Next", "Previous"].includes(button.Action));
  return hasText(workflow.WorkflowID) && hasText(workflow.WorkflowName) &&
    hasText(workflow.RobotId) && workflow.Steps.length > 0 &&
    new Set(workflow.Steps.map((step) => step.StepId)).size === workflow.Steps.length &&
    workflow.Steps.every((step) =>
      hasText(step.StepId) && hasText(step.ScreenId) &&
      (step.ScreenId !== "FollowMe" || hasText(step.NextDestinationName)) &&
      validButtons(step.Buttons) && mediaKinds.every((kind) =>
        (step[kind] ?? []).every((media) =>
          hasText(media[mediaPathKeys[kind]]) && validButtons(media.Buttons))));
}

function RobotWorkflowForm({ workflow, devices, busy, error, onSave, onClose }: {
  workflow: RobotWorkflow | null; devices: RegisteredDevice[]; busy: boolean; error: string | null;
  onSave: (workflow: RobotWorkflow) => Promise<void>; onClose: () => void;
}) {
  const t = useT();
  const formId = useId();
  const creating = workflow === null;
  const [draft, setDraft] = useState<RobotWorkflow>(() => workflow
    ? movementOnlyWorkflow(structuredClone(workflow))
    : { WorkflowID: uid(), WorkflowName: "", Description: "", RobotId: "",
      Steps: [{ StepId: "Step-1", ScreenId: "", Title: "" }] });
  const [invalid, setInvalid] = useState(false);
  const [uploads, setUploads] = useState(0);
  const [mediaMenu, setMediaMenu] = useState<number | null>(null);
  const uploadBusy = (value: boolean) => setUploads((count) => count + (value ? 1 : -1));
  const locked = busy || uploads > 0;
  const selectedRobot = devices.find((device) => device.deviceId === draft.RobotId);
  const patchStep = (index: number, patch: Partial<RobotStep>) => setDraft((current) => ({
    ...current, Steps: current.Steps.map((step, i) => i === index ? movementOnlyStep({ ...step, ...patch }) : step),
  }));
  const patchMedia = (index: number, kind: MediaKind, mediaIndex: number, value: RobotMedia | null) =>
    setDraft((current) => ({
      ...current, Steps: current.Steps.map((step, i) => {
        if (i !== index) return step;
        const list = (step[kind] ?? []).flatMap((item, k) => k !== mediaIndex ? [item] : value ? [value] : []);
        return { ...step, [kind]: list.length ? list : undefined };
      }),
    }));

  async function save() {
    if (locked) return;
    const value = movementOnlyWorkflow(creating ? {
      ...draft, WorkflowName: draft.WorkflowName.trim(), Description: draft.Description.trim(),
      Steps: draft.Steps.map((step, index) => {
        const normalized = { ...step, StepId: `Step-${index + 1}`, ScreenId: step.ScreenId.trim(),
          Title: step.Title?.trim(), TTS: step.TTS?.trim() || undefined,
          StartDestinationName: step.StartDestinationName?.trim() || undefined,
          NextDestinationName: step.NextDestinationName?.trim() || undefined };
        for (const kind of mediaKinds) {
          normalized[kind] = step[kind]?.filter((media) => media[mediaPathKeys[kind]]?.trim())
            .map((media) => ({ ...media, [mediaPathKeys[kind]]: media[mediaPathKeys[kind]]!.trim() }));
          if (!normalized[kind]?.length) delete normalized[kind];
        }
        return normalized;
      }),
    } : draft);
    if (!validRobotWorkflow(value) || !validRobotDestinations(value, selectedRobot)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    await onSave(value);
  }

  return (
    <Modal open title={creating ? t("createWorkflow") : t("robotEdit")} onClose={() => { if (!locked) onClose(); }} maxWidth={740}
      footer={<>
        <button type="button" className="btn btn-secondary" disabled={locked} onClick={onClose}>
          {t("cancel")}
        </button>
        <button type="button" className="btn btn-primary" disabled={locked} onClick={() => void save()}>
          <MdSave size={16} /> {t(creating ? "createWorkflowBtn" : "saveChanges")}
        </button>
      </>}>
      <fieldset className="workflow-form" disabled={locked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <Text label="WorkflowName *" value={draft.WorkflowName}
          onChange={(WorkflowName) => setDraft({ ...draft, WorkflowName })} />
        <div className="field">
          <label className="field-label" htmlFor={`${formId}-description`}>Description</label>
          <textarea id={`${formId}-description`} className="textarea" value={draft.Description}
            onChange={(event) => setDraft({ ...draft, Description: event.target.value })} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`${formId}-robot`}>RobotId *</label>
          <select id={`${formId}-robot`} className="select" value={draft.RobotId}
            onChange={(event) => setDraft({ ...draft, RobotId: event.target.value,
              Steps: creating ? draft.Steps.map((step) => ({
                ...step, StartDestinationName: undefined, NextDestinationName: undefined,
              })) : draft.Steps })}>
            {creating && <option value="">{t("fieldAssignBot")}</option>}
            {draft.RobotId && !devices.some((device) => device.deviceId === draft.RobotId) &&
              <option value={draft.RobotId}>{t("robotUnavailable", { id: draft.RobotId })}</option>}
            {devices.map((device) => <option key={device.deviceId} value={device.deviceId}>
              {device.deviceName} ({device.deviceId})
            </option>)}
          </select>
        </div>

        <div>
          <p className="workflow-section-label">Steps</p>
          <div className="workflow-builder">
            {draft.Steps.map((step, index) => (
              <div key={index} className="workflow-destination-block">
                <div className="workflow-destination-head">
                  <span className="workflow-destination-number">{index + 1}</span>
                  <button type="button" className="icon-btn" style={{ width: 30, height: 30, marginLeft: "auto" }}
                    disabled={draft.Steps.length <= 1} aria-label="Remove step"
                    onClick={() => {
                      setDraft({ ...draft, Steps: draft.Steps.filter((_, i) => i !== index) });
                      setMediaMenu(null);
                    }}>
                    <MdRemoveCircleOutline size={18} />
                  </button>
                </div>
                <div style={twoColumns}>
                  <div className="field">
                    <label className="field-label">StepId</label>
                    <input className="input" value={creating ? `Step-${index + 1}` : step.StepId} readOnly disabled
                      style={{ userSelect: "none", opacity: 0.6, cursor: "default" }} />
                  </div>
                  <ScreenSelect value={step.ScreenId} onChange={(ScreenId) => {
                    patchStep(index, { ScreenId });
                    setMediaMenu(null);
                  }} />
                  <Text label={t("fieldTitle")} disabled={step.ScreenId === "FollowMe"} value={step.Title ?? ""} onChange={(Title) => patchStep(index, { Title })} />
                  <Text label="TTS" value={step.TTS ?? ""} onChange={(TTS) => patchStep(index, { TTS: TTS || undefined })} />
                  <DestinationField label="StartDestinationName" value={step.StartDestinationName ?? ""}
                    disabled={step.ScreenId === "Confirmation"}
                    destinations={selectedRobot?.destinations ?? []} robotSelected={Boolean(selectedRobot)}
                    onChange={(value) => patchStep(index, { StartDestinationName: value || undefined })} />
                  <DestinationField label="NextDestinationName" value={step.NextDestinationName ?? ""}
                    disabled={step.ScreenId === "Confirmation"}
                    destinations={selectedRobot?.destinations ?? []} robotSelected={Boolean(selectedRobot)}
                    onChange={(value) => patchStep(index, { NextDestinationName: value || undefined })} />
                </div>
                <fieldset disabled={step.ScreenId === "FollowMe"} style={{ border: 0, padding: 0, minWidth: 0, margin: 0 }}>
                <div style={{ marginTop: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                  {mediaKinds.flatMap((kind) => (step[kind] ?? []).map((media, mediaIndex) => (
                    <MediaRow key={`${kind}-${mediaIndex}`} kind={kind} media={media} disabled={locked} creating={creating}
                      onBusyChange={uploadBusy}
                      onChange={(value) => patchMedia(index, kind, mediaIndex, value)}
                      onRemove={() => patchMedia(index, kind, mediaIndex, null)} />
                  )))}
                  <div style={{ position: "relative", alignSelf: "flex-start" }}>
                    <button type="button" className="btn btn-sm btn-secondary"
                      onClick={() => setMediaMenu(mediaMenu === index ? null : index)}>
                      <MdAdd size={16} /> Add media
                    </button>
                    {mediaMenu === index && (
                      <div className="surface-card" style={{ position: "absolute", top: "100%", left: 0, zIndex: 10, display: "flex", flexDirection: "column", padding: "var(--space-1)", minWidth: 120 }}>
                        {mediaKinds.map((kind) => (
                          <button key={kind} type="button" className="btn btn-sm btn-secondary" onClick={() => {
                            patchStep(index, { [kind]: [...(step[kind] ?? []), { [mediaPathKeys[kind]]: "" }] });
                            setMediaMenu(null);
                          }}>{kind}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", margin: "var(--space-2) 0", fontSize: "var(--fs-sm)" }}>
                  <input type="checkbox" checked={Boolean(step.Buttons)}
                    onChange={(event) => patchStep(index, { Buttons: event.target.checked ? defaultButtons : undefined })} />
                  Yes / No buttons
                </label>
                {step.Buttons && <ButtonFields buttons={step.Buttons}
                  onChange={(Buttons) => patchStep(index, { Buttons })} />}
                </fieldset>
              </div>
            ))}
            <button type="button" className="workflow-add-destination" onClick={() => setDraft({
              ...draft, Steps: [...draft.Steps, {
                StepId: typeof crypto !== "undefined" && crypto.randomUUID
                  ? crypto.randomUUID() : `Step-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                ScreenId: "", Title: "",
              }],
            })}>
              <MdAdd size={18} /> Add step
            </button>
          </div>
        </div>

        {(invalid || error) && <div className="workflow-error" role="alert">{error || t("robotInvalid")}</div>}
      </fieldset>
    </Modal>
  );
}

function ButtonFields({ buttons, onChange }: { buttons: RobotButtons; onChange: (value: RobotButtons) => void }) {
  return <div style={twoColumns}>
    <Text label="Yes label" value={buttons.Yes.Label}
      onChange={(Label) => onChange({ ...buttons, Yes: { ...buttons.Yes, Label } })} />
    <Act label="Yes action" value={buttons.Yes.Action}
      onChange={(Action) => onChange({ ...buttons, Yes: { ...buttons.Yes, Action } })} />
    <Text label="No label" value={buttons.No.Label}
      onChange={(Label) => onChange({ ...buttons, No: { ...buttons.No, Label } })} />
    <Act label="No action" value={buttons.No.Action}
      onChange={(Action) => onChange({ ...buttons, No: { ...buttons.No, Action } })} />
  </div>;
}

function MediaRow({ kind, media, disabled, creating, onBusyChange, onChange, onRemove }: {
  kind: MediaKind; media: RobotMedia; disabled: boolean; creating: boolean; onBusyChange: (busy: boolean) => void;
  onChange: (value: RobotMedia) => void; onRemove: () => void;
}) {
  const t = useT();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const pathKey = mediaPathKeys[kind];
  return <div>
    <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end" }}>
      <div style={{ flex: 1 }}>
        <Text label={pathKey} value={media[pathKey] ?? ""} onChange={(path) => onChange({ ...media, [pathKey]: path })} />
      </div>
      <label className="btn btn-sm btn-secondary" style={{ marginBottom: 6, cursor: "pointer" }}>
        {uploading ? t("robotMediaUploading") : "Browse"}
        <input type="file" hidden disabled={disabled} accept={creating ? `${kind.toLowerCase()}/*` :
          kind === "Video" ? ".mp4,.webm" : kind === "Audio" ? ".mp3,.wav,.m4a,.ogg" : ".png,.jpg,.jpeg,.webp"
        } onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          if (creating) {
            onChange({ ...media, [pathKey]: file.name });
            return;
          }
          setUploading(true);
          onBusyChange(true);
          setUploadError(null);
          try {
            onChange({ ...media, [pathKey]: await robotWorkflowApi.uploadMedia(kind, file) });
          } catch (cause) {
            setUploadError(robotWorkflowError(cause, t("robotMediaUploadFailed")));
          } finally {
            setUploading(false);
            onBusyChange(false);
          }
        }} />
      </label>
      <button type="button" className="icon-btn" style={{ width: 30, height: 30, marginBottom: 6 }}
        aria-label={`Remove ${kind}`} onClick={onRemove}>
        <MdRemoveCircleOutline size={18} />
      </button>
    </div>
    {uploadError && <p className="workflow-error" role="alert">{uploadError}</p>}
  </div>;
}

function Text({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <input id={id} className="input" disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Act({ label, value, onChange }: { label: string; value: ButtonAction; onChange: (v: ButtonAction) => void }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value as ButtonAction)}>
        <option value="Next">Next</option>
        <option value="Previous">Previous</option>
      </select>
    </div>
  );
}
