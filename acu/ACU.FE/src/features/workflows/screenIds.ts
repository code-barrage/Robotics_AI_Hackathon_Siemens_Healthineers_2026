// Screens the robot app can show for a workflow step (stored as the step's ScreenId).
export const SCREEN_IDS = [
  { id: "Destinations", label: "Destinations Screen" },
  { id: "PatientIdentification", label: "Patient Identification" },
  { id: "Confirmation", label: "Confirmation Screen" },
  { id: "FollowMe", label: "Follow Me" },
  { id: "Custom", label: "Custom" },
] as const;