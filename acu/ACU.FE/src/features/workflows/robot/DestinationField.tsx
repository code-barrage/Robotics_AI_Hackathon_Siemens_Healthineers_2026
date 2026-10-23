import type { MapDestination } from "../../../types";
import { useId } from "react";
import { useT } from "../../../i18n/I18nProvider";

export default function DestinationField({ label, value, destinations, robotSelected, disabled = false, onChange }: {
  label: string; value: string; destinations: MapDestination[]; robotSelected: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const t = useT();
  const id = useId();
  const names = [...new Set(destinations.map((destination) => destination.name))];
  const unavailable = Boolean(value && !names.includes(value));
  return <div className="field" style={disabled ? { opacity: 0.6 } : undefined}>
    <label className="field-label" htmlFor={id}>{label}</label>
    <select id={id} className="select" value={value} disabled={disabled || !robotSelected}
      style={disabled ? { cursor: "not-allowed" } : undefined}
      onChange={(event) => onChange(event.target.value)}>
      <option value="">{t("robotDestinationNone")}</option>
      {unavailable && <option value={value} disabled>{t("robotDestinationUnavailable", { name: value })}</option>}
      {names.map((name) => <option key={name} value={name}>{name}</option>)}
    </select>
    {robotSelected && names.length === 0 && <span>{t("robotDestinationEmpty")}</span>}
    {unavailable && <span role="alert">{t("robotDestinationUnavailable", { name: value })}</span>}
  </div>;
}
