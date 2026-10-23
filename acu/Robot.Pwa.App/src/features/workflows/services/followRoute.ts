export function navigationAborted(): Error {
  const error = new Error("Navigation was cancelled.");
  error.name = "AbortError";
  return error;
}

export interface ArrivalBridge {
  clearLastArrival(tableNum: string): Promise<void>;
  moveToDestination(options: { destination: string }): Promise<{ success: boolean; destination: string }>;
  addListener(event: "arrival", listener: (event: { tableNum: string }) => void): { remove(): void };
}

/** Subscribe before dispatch; a callback must match this command, not an earlier arrival. */
export function moveAndWait(
  bridge: ArrivalBridge, destination: string, signal: AbortSignal, onDispatched: () => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(navigationAborted()); return; }
    let accepting = false;
    let dispatched = false;
    let arrived = false;
    let settled = false;
    let subscription: { remove(): void } | undefined;
    const finish = (success: boolean, error?: unknown) => {
      if (settled) return;
      settled = true;
      subscription?.remove();
      signal.removeEventListener("abort", cancel);
      if (success) resolve();
      else reject(error);
    };
    const cancel = () => finish(false, navigationAborted());
    try {
      subscription = bridge.addListener("arrival", ({ tableNum }) => {
        if (!accepting || tableNum !== destination) return;
        arrived = true;
        if (dispatched) finish(true);
      });
      signal.addEventListener("abort", cancel, { once: true });
      void bridge.clearLastArrival(destination).then(async () => {
        if (settled) return;
        accepting = true;
        const result = await bridge.moveToDestination({ destination });
        if (settled) return;
        if (!result.success || result.destination !== destination)
          throw new Error(`Robot did not accept movement to ${destination}.`);
        dispatched = true;
        onDispatched();
        if (arrived) finish(true);
      }).catch((cause: unknown) => finish(false, cause));
    } catch (cause) {
      finish(false, cause);
    }
  });
}

export type FollowPhase = "positioning" | "traveling";

export async function runFollowRoute(options: {
  start?: string; next?: string; signal: AbortSignal;
  current: () => string | null;
  move: (destination: string, signal: AbortSignal) => Promise<void>;
  onArrived: (destination: string) => void;
  onPhase: (phase: FollowPhase, destination: string) => void;
}): Promise<void> {
  const { start, next, signal, current, move, onArrived, onPhase } = options;
  if (!next?.trim()) throw new Error("FollowMe needs a NextDestinationName before it can move.");
  const check = () => { if (signal.aborted) throw navigationAborted(); };
  check();
  if (start?.trim() && current() !== start) {
    onPhase("positioning", start);
    await move(start, signal);
    check();
    onArrived(start);
  } else if (start?.trim()) {
    onArrived(start);
  }
  check();
  if (current() !== next) {
    onPhase("traveling", next);
    await move(next, signal);
    check();
    onArrived(next);
  }
}
