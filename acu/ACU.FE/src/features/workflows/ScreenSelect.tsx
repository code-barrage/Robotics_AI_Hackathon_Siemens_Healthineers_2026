import { useId } from "react";
import { SCREEN_IDS } from "./screenIds";

export default function ScreenSelect({ label = "ScreenId *", value, onChange }: {
  label?: string; value: string; onChange: (value: string) => void;
}) {
  const id = useId();
  const known = SCREEN_IDS.some((screen) => screen.id === value);
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <select id={id} className="select" value={known ? value : ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">— select screen —</option>
        {SCREEN_IDS.map((screen) => <option key={screen.id} value={screen.id}>{screen.label}</option>)}
      </select>
    </div>
  );
}
