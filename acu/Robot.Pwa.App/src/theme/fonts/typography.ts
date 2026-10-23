import { StyleSheet } from "react-native";
 
export const FontSize = {
  caption: 11,
  small: 12,
  body: 13,
  regular: 14,
  button: 22,
  label: 16,
  bodyLarge: 18,
  heading: 20,
  title: 22,
  displaySmall: 28,
  subtitle: 30,
  workflowTitle: 32,
  display: 86,
  displayLarge: 60,
  screenTitle: 48,
  icon: 34,
  routeMarker: 20,
  destinationPin: 48,
} as const;
 
export const LineHeight = {
  routeMarker: 28,
} as const;
 
export const FontFamily = {
  roman: "SourceSans3_400Regular",
  bold: "SourceSans3_700Bold",
  black: "SourceSans3_900Black",
  brand: "SourceSans3_700Bold",
} as const;
 
const roman = { fontFamily: FontFamily.roman };
const bold = { fontFamily: FontFamily.bold };
 
export const Typography = StyleSheet.create({
  roman,
  heading: { ...bold, fontSize: FontSize.heading },
  title: { ...bold, fontSize: FontSize.title },
  cardTitle: { ...bold, fontSize: FontSize.label },
  button: { ...bold, fontSize: FontSize.button },
  body: { ...roman, fontSize: FontSize.body },
  small: { ...roman, fontSize: FontSize.small },
  caption: { ...roman, fontSize: FontSize.caption },
  label: { ...bold, fontSize: FontSize.body },
  input: { ...roman, fontSize: FontSize.regular },
  code: { ...roman, fontSize: FontSize.body },
  smallCode: { ...roman, fontSize: FontSize.small },
  captionCode: { ...roman, fontSize: FontSize.caption },
  status: bold,
  emphasis: bold,
  validation: { ...roman, fontSize: FontSize.caption },
  stat: { ...bold, fontSize: FontSize.regular },
  badge: { ...bold, fontSize: FontSize.caption },
  icon: { ...roman, fontSize: FontSize.icon },
  routeTick: { ...bold, fontSize: FontSize.heading, lineHeight: LineHeight.routeMarker },
  routeNumber: { ...bold, fontSize: FontSize.routeMarker },
  destinationHeading: { ...bold, fontSize: FontSize.displaySmall },
  destinationPin: { ...roman, fontSize: FontSize.destinationPin },
  workflowTitle: bold,
  workflowScreenTitle: { fontSize: FontSize.screenTitle },
  workflowCompactTitle: { fontSize: FontSize.workflowTitle },
  workflowAssignedTitle: { fontSize: FontSize.displayLarge },
  workflowIdleTitle: { fontSize: FontSize.display },
  workflowSubtitle: { ...roman, fontSize: FontSize.subtitle },
  workflowCompactSubtitle: { ...roman, fontSize: FontSize.title },
  workflowMessage: { ...roman, fontSize: FontSize.bodyLarge },
  black: { fontFamily: FontFamily.black },
});
 
 