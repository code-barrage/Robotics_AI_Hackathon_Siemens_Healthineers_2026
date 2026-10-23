export interface Destination {
  name: string;
  type?: string;
  x?: number;
  y?: number;
  z?: number;
}

export function isDestination(value: unknown): value is Destination {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.name === "string" && Boolean(item.name.trim()) &&
    (item.type === undefined || typeof item.type === "string") &&
    [item.x, item.y, item.z].every((coordinate) =>
      coordinate === undefined || (typeof coordinate === "number" && Number.isFinite(coordinate)));
}
