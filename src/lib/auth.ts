import { NextRequest } from "next/server";

// Validates Bearer token on mutating API routes.
export function requireApiKey(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${process.env.API_KEY}`;
}
