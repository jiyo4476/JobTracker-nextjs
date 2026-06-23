// Typed fetch wrappers for all API routes.
// Used by TanStack Query hooks in lib/queries/.

const BASE = "/api";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = process.env.NEXT_PUBLIC_API_KEY;
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (apiKey && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${apiKey}`);
  }

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
