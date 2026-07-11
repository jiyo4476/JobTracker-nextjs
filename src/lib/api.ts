// Typed fetch wrappers for all API routes.
// Used by TanStack Query hooks in lib/queries/.

const BASE = "/api";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}${await describeErrorBody(res)}`);
  return res.json() as Promise<T>;
}

// Route handlers respond with either { error: "some message" } or, for Zod validation
// failures, { error: parsed.error.flatten() } (formErrors + fieldErrors). Surface either
// shape instead of discarding the body and leaving callers with only a generic status code.
async function describeErrorBody(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const error = body?.error;
    if (typeof error === "string") return `: ${error}`;
    if (error && typeof error === "object") {
      const messages = [
        ...(Array.isArray(error.formErrors) ? error.formErrors : []),
        ...(error.fieldErrors && typeof error.fieldErrors === "object"
          ? Object.values(error.fieldErrors).flat()
          : []),
      ];
      if (messages.length > 0) return `: ${messages.join(", ")}`;
    }
  } catch {
    // response body wasn't JSON — fall back to the generic message
  }
  return "";
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
