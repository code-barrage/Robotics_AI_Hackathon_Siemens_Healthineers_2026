import ScreenTemplate, { type TemplateProps } from "./ScreenTemplate";

export const PATIENT_IDENTIFICATION_DIALOGUE = "Hi {PatientName}, is this you?";
export const PATIENT_NAME = "Patient";

export default function PatientIdentificationScreen(props: TemplateProps) {
  return <ScreenTemplate {...props} testID="workflow-patient-identification-screen"
    dialogue={PATIENT_IDENTIFICATION_DIALOGUE} patientName={PATIENT_NAME} />;
}
