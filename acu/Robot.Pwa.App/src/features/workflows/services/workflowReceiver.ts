export interface WorkflowReceiverOptions {
  receive: (signal: AbortSignal) => Promise<unknown>;
  onReceived: (value: unknown) => void;
  onError: (error: unknown) => void;
  onSettled: () => void;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
}

export function startRobotWorkflowReceiver({
  receive, onReceived, onError, onSettled,
  schedule = setTimeout, cancel = clearTimeout,
}: WorkflowReceiverOptions): () => void {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failureDelay = 5000;

  async function tick() {
    let nextDelay = 3000;
    try {
      const value = await receive(controller.signal);
      if (controller.signal.aborted) return;
      onReceived(value);
      failureDelay = 5000;
    } catch (cause) {
      if (controller.signal.aborted) return;
      onError(cause);
      nextDelay = failureDelay;
      failureDelay = Math.min(failureDelay * 2, 30000);
    } finally {
      if (!controller.signal.aborted) {
        onSettled();
        timer = schedule(() => void tick(), nextDelay);
      }
    }
  }

  void tick();
  return () => {
    controller.abort();
    if (timer !== undefined) cancel(timer);
  };
}
