import ScreenTemplate, { type TemplateProps } from "./ScreenTemplate";

/** Custom screen: the parent template with no built-in dialogue — only the workflow's title, media and buttons. */
export default function CustomScreen(props: TemplateProps) {
  return <ScreenTemplate {...props} testID="workflow-custom-screen" />;
}