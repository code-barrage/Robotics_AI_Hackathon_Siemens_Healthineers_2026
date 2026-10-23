/**
 * Remote commands sent by an operator dashboard through the ACU's existing instructions channel
 * (POST /api/acu/instructions/{deviceId} with { command: "<json>" }). The robot sees the latest
 * instruction in every heartbeat response and runs each command id once.
 */
export type RemoteCommand =
  | { id: string; action: "navigate"; destination: string }
  | { id: string; action: "say"; text: string; lang?: string }
  | { id: string; action: "stopSpeech" }
  | { id: string; action: "cancel" }
  | { id: string; action: "camera"; on: boolean; face: boolean; intervalMs: number }
  | { id: string; action: "ping" };

export type RemoteCommandAction = RemoteCommand["action"];

export type CommandStatus = "running" | "done" | "failed";

export interface CommandReport {
  id: string;
  action: string;
  status: CommandStatus;
  at: string;
  message?: string;
}

const DEFAULT_CAMERA_INTERVAL_MS = 500;

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Returns null for empty instructions, plain-text (legacy) instructions, and malformed commands. */
export function parseRemoteCommand(raw: string | null | undefined): RemoteCommand | null {
  if (!raw || !raw.trim().startsWith("{")) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const id = text(v.id);
  if (!id) return null;
  switch (v.action) {
    case "navigate": {
      const destination = text(v.destination);
      return destination ? { id, action: "navigate", destination } : null;
    }
    case "say": {
      const t = text(v.text);
      if (!t) return null;
      const lang = text(v.lang);
      return lang ? { id, action: "say", text: t, lang } : { id, action: "say", text: t };
    }
    case "stopSpeech":
    case "cancel":
    case "ping":
      return { id, action: v.action };
    case "camera": {
      if (typeof v.on !== "boolean") return null;
      const interval = typeof v.intervalMs === "number" && Number.isFinite(v.intervalMs)
        ? Math.min(Math.max(Math.round(v.intervalMs), 100), 10_000)
        : DEFAULT_CAMERA_INTERVAL_MS;
      return { id, action: "camera", on: v.on, face: v.face !== false, intervalMs: interval };
    }
    default:
      return null;
  }
}

/**
 * Decides which instructions to run. The first instruction seen after the app starts is only
 * recorded, so a stale command left on the ACU is not replayed on every app launch.
 */
export class RemoteCommandGate {
  private baseline = false;
  private lastId: string | null = null;

  accept(raw: string | null | undefined): RemoteCommand | null {
    const command = parseRemoteCommand(raw);
    if (!this.baseline) {
      this.baseline = true;
      this.lastId = command?.id ?? null;
      return null;
    }
    if (!command || command.id === this.lastId) return null;
    this.lastId = command.id;
    return command;
  }
}

/** Short heartbeat event (kept under ~80 chars so the ACU's recent-events list stays readable). */
export function commandEvent(report: CommandReport): string {
  const detail = report.message ? ` ${report.message}` : "";
  return `remote_${report.action}_${report.status}${detail}`.slice(0, 80);
}
