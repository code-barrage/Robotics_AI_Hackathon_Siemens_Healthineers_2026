import type { PuduConfig } from "../../config/types";
import { jsonRequest } from "../http/jsonRequest";
import { buildPuduPointRequest } from "./puduRequest";
import { isDestination, type Destination } from "../../features/destinations/model/destination";

export async function fetchDestinations(config: PuduConfig, signal?: AbortSignal): Promise<Destination[]> {
  const request = buildPuduPointRequest(config);
  const body = await jsonRequest<unknown>(request.url, { method: "GET", headers: request.headers, signal });

  if (typeof body !== "object" || body === null) {
    throw new Error("No response from Pudu Cloud");
  }

  const response = body as Record<string, unknown>;
  if (response.code !== undefined && response.code !== 200 && response.code !== 0) {
    throw new Error(typeof response.message === "string" ? response.message : `Pudu Cloud returned error code ${response.code}`);
  }

  // Pudu Cloud returns: { message: "success", data: { total: N, list: [...] } } or { data: [...] }
  let list: unknown[];
  if (Array.isArray(body)) {
    list = body;
  } else if (Array.isArray(response.data)) {
    list = response.data;
  } else if (typeof response.data === "object" && response.data !== null &&
      "list" in response.data && Array.isArray(response.data.list)) {
    list = response.data.list;
  } else if (Array.isArray(response.list)) {
    list = response.list;
  } else {
    throw new Error("Pudu Cloud returned an unrecognized destination response.");
  }

  if (!list.every(isDestination)) {
    throw new Error("Pudu Cloud returned invalid destination points.");
  }
  return list;
}
