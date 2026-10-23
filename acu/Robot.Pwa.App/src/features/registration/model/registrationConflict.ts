export function isSameDeviceRegistrationConflict(
  status: number, message: string, deviceId: string,
): boolean {
  return status === 409 && message.startsWith(`Device '${deviceId}' is already registered (status: `);
}
