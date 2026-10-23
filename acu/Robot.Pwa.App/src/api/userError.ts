type ErrorContext = "registration" | "acu" | "destinations" | "movement" | "speech" | "media";

const FALLBACKS: Record<ErrorContext, string> = {
  registration: "Could not register device.",
  acu: "Could not connect to ACU.",
  destinations: "Could not load destinations.",
  movement: "Could not move robot.",
  speech: "Speech unavailable.",
  media: "Could not load media.",
};

/** Translate technical errors only at the UI boundary; keep the original error for diagnostics. */
export function userErrorMessage(cause: unknown, context: ErrorContext): string {
  const message = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
  const status = typeof cause === "object" && cause !== null && "status" in cause &&
    typeof cause.status === "number" ? cause.status : undefined;
  const code = typeof cause === "object" && cause !== null && "code" in cause ? cause.code : undefined;
  if (context === "acu" || context === "registration") {
    if (/not registered|registration is missing|registered robot device ID is required/i.test(message))
      return "Device is not registered.";
    if (/not approved|must be approved/i.test(message)) return "Device is awaiting approval.";
    if (status === 409 && context === "acu") return "Workflow is no longer assigned. Return to Start.";
    if (status === 409 && context === "registration")
      return /MAC/i.test(message)
        ? "A device with the same MAC is already registered."
        : "A device with the same SN is already registered.";
    if (status === 401 || status === 403) return "ACU access denied.";
    if (status === 404) return "ACU service not found. Check the server address.";
    if (status === 400) return context === "registration"
      ? "Check the device details." : "ACU could not process the request.";
    if (/schema|invalid.*response|invalid JSON|invalid statusData/i.test(message))
      return "ACU returned invalid data.";
    if (/no workflow is assigned/i.test(message)) return "No workflow assigned.";
  }
  if (context === "destinations") {
    if (status === 401 || status === 403 || /authentication|credentials.*required/i.test(message))
      return "Check the Pudu Cloud credentials.";
    if (/invalid|unrecognized/i.test(message)) return "Pudu Cloud returned invalid data.";
  }
  if (/failed to fetch|network request failed|networkerror|fetch failed|timeout|timed out/i.test(message) ||
      (cause instanceof Error && cause.name === "AbortError") || (status !== undefined && status >= 500))
    return context === "destinations" ? "Pudu Cloud unreachable." :
      context === "acu" || context === "registration" ? "ACU unreachable." : FALLBACKS[context];
  if (context === "movement") {
    if (/NextDestinationName/i.test(message)) return "Next destination is missing.";
    if (/native module is missing/i.test(message)) return "Robot controls unavailable. Update the app.";
    if (/requires.*Android|only available on.*Android/i.test(message)) return "Movement is only available on the robot.";
  }
  if (context === "speech") {
    if (code === "TTS_SETTINGS_FAILED") return "The voice engine could not apply pitch, speed or audio routing.";
    if (code === "TTS_SETTINGS_INVALID" || /Invalid saved speech settings/.test(message)) return "Invalid speech settings. Check the saved volume, pitch and speed.";
    if (code === "LANG_MISSING_DATA") return "Voice data not installed.";
    if (code === "LANG_NOT_SUPPORTED") return "Selected language is not supported.";
    if (/only.*installed on the robot/i.test(message)) return "Install voices on the robot.";
  }
  if (context === "media" && /permission|denied/i.test(message)) return "Allow access to media files.";
  return FALLBACKS[context];
}

export function reportUserError(cause: unknown, context: ErrorContext): string {
  console.warn(`Robot PWA ${context} failed`, cause);
  return userErrorMessage(cause, context);
}
