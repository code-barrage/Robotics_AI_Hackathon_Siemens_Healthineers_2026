import type { ComponentType } from "react";
import ConfirmationScreen from "./ConfirmationScreen";
import CustomScreen from "./CustomScreen";
import DestinationsScreen from "./DestinationsScreen";
import FollowMeScreen from "./FollowMeScreen";
import PatientIdentificationScreen from "./PatientIdentificationScreen";
import type { TemplateProps } from "./ScreenTemplate";

/**
 * ScreenId (chosen in the ACU workflow editor) → template. To add a template, create a file that
 * wraps ScreenTemplate with its own dialogue and register it here. These are the only screens;
 * any other ScreenId is shown as Custom.
 */
export const SCREEN_TEMPLATES: Record<string, ComponentType<TemplateProps>> = {
  Destinations: DestinationsScreen,
  PatientIdentification: PatientIdentificationScreen,
  Confirmation: ConfirmationScreen,
  FollowMe: FollowMeScreen,
  Custom: CustomScreen,
};

export function templateFor(screenId: string): ComponentType<TemplateProps> {
  return SCREEN_TEMPLATES[screenId] ?? CustomScreen;
}

export type { TemplateProps };
