import type { Destination } from "./model/destination";

/** Stable identity of a destination list; used to send the list via heartbeat only when it changed. */
export function destinationsSignature(list: Destination[]): string {
  return JSON.stringify(list.map(({ name, type, x, y, z }) => [name, type ?? "", x ?? null, y ?? null, z ?? null]));
}

/** Returns the list to attach to the next heartbeat, or null when ACU already has it (or nothing was fetched yet). */
export function destinationsToSend(
  list: Destination[] | null, lastSent: string | null,
): { destinations: Destination[]; signature: string } | null {
  if (!list) return null;
  const signature = destinationsSignature(list);
  return signature === lastSent ? null : { destinations: list, signature };
}
