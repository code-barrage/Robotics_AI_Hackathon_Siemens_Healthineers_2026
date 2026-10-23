import { useState } from "react";
import DestinationsPage from "../DestinationsPage";
import ScreenTemplate, { type TemplateProps } from "./ScreenTemplate";

export const DESTINATIONS_DIALOGUE = "Please choose a destination";

/** A confirmed destination arrival advances the workflow, including final-step completion. */
export default function DestinationsScreen(props: TemplateProps) {
  const [moving, setMoving] = useState(false);
  return <ScreenTemplate {...props} testID="workflow-destinations-screen" dialogue={DESTINATIONS_DIALOGUE} fill
    hidePresentation={moving} actionsDisabled={moving}>
    <DestinationsPage onNavigatingChange={setMoving} onArrived={() => props.onAction("Next")} />
  </ScreenTemplate>;
}
