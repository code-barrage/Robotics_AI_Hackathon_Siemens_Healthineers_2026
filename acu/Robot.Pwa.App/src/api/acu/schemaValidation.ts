import Ajv from "ajv";
import deviceSchema from "../../../../BE/AcuStorage/Store/Schemas/device.schema.json";
import workflowSchema from "../../../../BE/AcuStorage/Store/Schemas/workflow.schema.json";

const ajv = new Ajv({ allErrors: true, strict: false });
const deviceDocument = ajv.compile(deviceSchema);
const workflowDocument = ajv.compile(workflowSchema);

export function validateDeviceDocument(value: unknown): void {
  if (!deviceDocument(value))
    throw new Error(`ACU device.schema.json validation failed: ${ajv.errorsText(deviceDocument.errors)}`);
}

export function validateWorkflowDocument(value: unknown): void {
  if (!workflowDocument(value))
    throw new Error(`ACU workflow.schema.json validation failed: ${ajv.errorsText(workflowDocument.errors)}`);
}
