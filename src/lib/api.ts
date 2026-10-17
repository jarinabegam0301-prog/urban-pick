import { PUBLIC_API_URL, SERVER_API_URL } from "@/lib/config";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type ValidationIssue = { msg?: string; loc?: (string | number)[] };

function messageFrom(body: unknown, status: number): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const issue = detail[0] as ValidationIssue;
      const message = (issue.msg ?? "Check the form and try again.").replace(/^Value error, /, "");
      return message;
    }
  }
  if (status >= 500) return "Something went wrong on our side. Try again.";
  return "Request failed. Try again.";
}

async function request<T>(baseUrl: string, path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, init);
  } catch {
    throw new ApiError("Can't reach the URBAN API. Check that it is running.", 0);
  }

  if (response.status === 204) return undefined as T;

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(messageFrom(body, response.status), response.status);
  return body as T;
}

/** Server-side request for public store data. Never cached, so stock is always current. */
export function serverFetch<T>(path: string): Promise<T> {
  return request<T>(SERVER_API_URL, path, { cache: "no-store" });
}

/** Browser request that carries the admin session cookie. */
export function clientFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  return request<T>(PUBLIC_API_URL, path, { ...init, headers, credentials: "include" });
}

export function queryString(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}
