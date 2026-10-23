export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export async function jsonRequest<T = unknown>(
  url: string,
  options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    signal?: AbortSignal;
  }
): Promise<T> {
  const method = options?.method || "GET";
  const headers = options?.headers || { "Content-Type": "application/json" };
  const body = options?.body !== undefined
    ? typeof options.body === "string"
      ? options.body
      : JSON.stringify(options.body)
    : undefined;

  const res = await fetch(url, { method, headers, body, signal: options?.signal });
  const raw = await res.text();
  let json: unknown;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    if (res.ok) throw new Error(`HTTP ${res.status}: Server returned invalid JSON.`);
  }

  if (!res.ok) {
    let error: string | undefined;
    if (typeof json === "object" && json !== null) {
      if ("error" in json && typeof json.error === "string") error = json.error;
      else if ("detail" in json && typeof json.detail === "string") error = json.detail;
    }
    throw new HttpError(res.status, error || `HTTP ${res.status}: ${res.statusText}`);
  }

  return json as T;
}
