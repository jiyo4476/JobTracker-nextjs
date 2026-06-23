import { NextRequest } from "next/server";

// Validates Bearer token on mutating API routes.
export function requireApiKey(req: NextRequest): boolean {
  const key = process.env.API_KEY;
  if (!key) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${key}`;
}
