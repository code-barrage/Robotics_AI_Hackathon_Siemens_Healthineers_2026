import { MdCheckCircle, MdError } from "../../icons";

interface Props {
  type: "success" | "error";
  message: string;
}

/**
 * Toast — small, transient notification used to give the user feedback
 * after an action (e.g. "Workflow saved", "Failed to load").
 *
 * Behaviour:
 * - Non-blocking overlay; does not require user interaction to dismiss.
 * - Positioning, slide-in animation and colour variants are defined by
 *   the `.toast`, `.toast.success` and `.toast.error` rules in
 *   `AppShell.css`. On mobile it appears above the bottom nav bar;
 *   on tablet/desktop it docks to the top-right corner.
 * - The caller is responsible for showing/hiding the component (typically
 *   via `setTimeout` after a few seconds).
 *
 * Accessibility:
 * - `role="status"` + `aria-live="polite"` so screen readers announce the
 *   message without interrupting the user.
 *
 * Props:
 * - `type`    — `"success"` (green) or `"error"` (red); selects the icon and colour.
 * - `message` — text shown next to the icon.
 */
export default function Toast({ type, message }: Props) {
  return (
    <div className={`toast ${type}`} role="status" aria-live="polite">
      {type === "success" ? <MdCheckCircle size={18} /> : <MdError size={18} />}
      <span>{message}</span>
    </div>
  );
}
