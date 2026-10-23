import ScreenTemplate, { type TemplateProps } from "./ScreenTemplate";

export const CONFIRMATION_DIALOGUE = "Please confirm";

export default function ConfirmationScreen(props: TemplateProps) {
  return <ScreenTemplate {...props} testID="workflow-confirmation-screen" dialogue={CONFIRMATION_DIALOGUE} />;
}
