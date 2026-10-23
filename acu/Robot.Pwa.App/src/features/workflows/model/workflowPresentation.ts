export type WorkflowButton = { Label?: string; Action?: "Next" | "Previous" };
export type WorkflowButtons = { Yes: WorkflowButton; No: WorkflowButton };
export type WorkflowMedia = {
  VideoPath?: string; AudioPath?: string; ImagePath?: string;
  TTS?: string; Buttons?: WorkflowButtons;
};
export type WorkflowScreen = {
  StepId: string; ScreenId: string; Title?: string; TTS?: string;
  StartDestinationName?: string; NextDestinationName?: string;
  Video?: WorkflowMedia[]; Audio?: WorkflowMedia[]; Image?: WorkflowMedia[];
  Buttons?: WorkflowButtons;
};
export type WorkflowDefinition = {
  WorkflowID: string; WorkflowName: string; Description?: string; RobotId: string; Steps: WorkflowScreen[];
};
export type WorkflowPresentation = { workflow: WorkflowDefinition };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function button(value: unknown): value is WorkflowButton {
  return record(value) && (value.Label === undefined || typeof value.Label === "string") &&
    (value.Action === undefined || value.Action === "Next" || value.Action === "Previous");
}

function buttons(value: unknown): value is WorkflowButtons {
  return record(value) && button(value.Yes) && button(value.No);
}

function media(value: unknown): value is WorkflowMedia {
  return record(value) && ["VideoPath", "AudioPath", "ImagePath", "TTS"].every(
    (key) => value[key] === undefined || typeof value[key] === "string"
  ) && (value.Buttons === undefined || buttons(value.Buttons));
}

function screen(value: unknown): value is WorkflowScreen {
  return record(value) && ["StepId", "ScreenId"].every(
    (key) => typeof value[key] === "string"
  ) && ["Title", "TTS", "StartDestinationName", "NextDestinationName"].every(
    (key) => value[key] === undefined || typeof value[key] === "string"
  ) && ["Video", "Audio", "Image"].every(
    (key) => value[key] === undefined || (Array.isArray(value[key]) && value[key].every(media))
  ) && (value.Buttons === undefined || buttons(value.Buttons));
}

function workflow(value: unknown): value is WorkflowDefinition {
  return record(value) && ["WorkflowID", "WorkflowName", "RobotId"].every(
    (key) => typeof value[key] === "string"
  ) && (value.Description === undefined || typeof value.Description === "string") &&
    Array.isArray(value.Steps) && value.Steps.length > 0 && value.Steps.every(screen);
}

export function parseWorkflowDocument(value: unknown, robotId: string): WorkflowDefinition | null {
  if (!record(value) || !Array.isArray(value.Workflows) || !value.Workflows.every(workflow))
    throw new Error("ACU returned an invalid workflow.schema.json document.");
  const assigned = value.Workflows.filter((item) => item.RobotId === robotId);
  if (assigned.length !== value.Workflows.length || assigned.length > 1)
    throw new Error("ACU returned an ambiguous workflow assignment or a workflow for a different robot.");
  return assigned[0] ?? null;
}

export function parseWorkflowPresentation(
  response: { document: unknown }, robotId: string,
): WorkflowPresentation | null {
  const workflow = parseWorkflowDocument(response.document, robotId);
  if (!workflow) return null;
  return { workflow };
}

export function getScreenMedia(step: WorkflowScreen) {
  return [
    ...(step.Video ?? []).filter((item) => item.VideoPath).map((item) => ({ kind: "video" as const, path: item.VideoPath!, ...item })),
    ...(step.Image ?? []).filter((item) => item.ImagePath).map((item) => ({ kind: "image" as const, path: item.ImagePath!, ...item })),
    ...(step.Audio ?? []).filter((item) => item.AudioPath).map((item) => ({ kind: "audio" as const, path: item.AudioPath!, ...item })),
  ];
}

export function getScreenKind(step: WorkflowScreen): "title" | "title-button" | "media" {
  if (getScreenMedia(step).length) return "media";
  return step.Buttons ? "title-button" : "title";
}

/** Built-in interactive screens must still run after introductory media. */
export function hasContentAfterMedia(step: WorkflowScreen): boolean {
  const hasButtons = (value?: WorkflowButtons) =>
    !!value && [value.Yes, value.No].some((item) => !!(item.Label || item.Action));
  return ["Confirmation", "PatientIdentification", "Destinations", "FollowMe"].includes(step.ScreenId)
    || !!step.Title?.trim() || !!stepSpeechText(step) || hasButtons(step.Buttons)
    || getScreenMedia(step).some((item) => item.kind === "audio" || hasButtons(item.Buttons));
}

export function nextScreenIndex(index: number, action: WorkflowButton["Action"], count: number): number {
  return Math.max(0, Math.min(count, index + (action === "Next" ? 1 : action === "Previous" ? -1 : 0)));
}

export type DestinationProgress = { reached: number; total: number; destinations: string[] };

/** Ordered movement stops; shared boundaries count once, later return visits count again. */
export function workflowDestinationStops(steps: WorkflowScreen[]): { name: string; steps: number[] }[] {
  const stops: { name: string; steps: number[] }[] = [];
  steps.forEach((step, index) => {
    if (step.ScreenId !== "FollowMe" || !step.NextDestinationName?.trim()) return;
    for (const name of [step.StartDestinationName, step.NextDestinationName]) {
      if (!name?.trim()) continue;
      const previous = stops[stops.length - 1];
      if (previous?.name === name) {
        if (!previous.steps.includes(index)) previous.steps.push(index);
      } else stops.push({ name, steps: [index] });
    }
  });
  return stops;
}

export function destinationReachedCount(
  steps: WorkflowScreen[], stepIndex: number, name: string, reached: number,
): number {
  const stops = workflowDestinationStops(steps);
  const stopIndex = stops.findIndex((stop) => stop.name === name && stop.steps.includes(stepIndex));
  return stopIndex < 0 ? reached : Math.max(reached, stopIndex + 1);
}

export function destinationProgress(steps: WorkflowScreen[], reached: number): DestinationProgress {
  const destinations = workflowDestinationStops(steps).map((stop) => stop.name);
  return { reached: Math.max(0, Math.min(reached, destinations.length)), total: destinations.length, destinations };
}

export type TextPart = { text: string; highlight: boolean };

/** Replaces {StartDestination} / {NextDestination} in screen text with the step's destinations. */
export function fillPlaceholderText(text: string, step: WorkflowScreen): string {
  return text
    .replace(/\{StartDestination\}/g, step.StartDestinationName ?? "")
    .replace(/\{NextDestination\}/g, step.NextDestinationName ?? "");
}

/** Like fillPlaceholderText, plus {PatientName} which is returned as a highlighted part. */
export function fillPlaceholders(text: string, step: WorkflowScreen, patientName = ""): TextPart[] {
  return fillPlaceholderText(text, step).split(/(\{PatientName\})/).filter(Boolean).map((part) =>
    part === "{PatientName}" ? { text: patientName, highlight: true } : { text: part, highlight: false });
}

/** Text the robot speaks when the step is shown: the step's TTS (else the first media TTS) with every placeholder filled; "" when nothing to say. */
export function stepSpeechText(step: WorkflowScreen, patientName = ""): string {
  const raw = step.TTS?.trim()
    || (step.ScreenId !== "FollowMe" &&
      [...(step.Video ?? []), ...(step.Audio ?? []), ...(step.Image ?? [])].map((m) => m.TTS?.trim()).find(Boolean))
    || "";
  if (!raw) return "";
  return fillPlaceholderText(raw, step).replace(/\{PatientName\}/g, patientName).replace(/\s+/g, " ").trim();
}
