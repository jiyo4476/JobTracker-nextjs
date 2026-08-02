import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/** Thrown at startup when the required DATABASE_URL env var is missing or empty. */
export class MissingDatabaseUrlError extends Error {
  constructor() {
    super(
      "DATABASE_URL is not set. Provide a PostgreSQL connection string via the environment before starting the app.",
    );
    this.name = "MissingDatabaseUrlError";
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new MissingDatabaseUrlError();
}

// `postgres-js` already reads `sslmode` off DATABASE_URL's query string (e.g.
// `?sslmode=require`), so a managed-Postgres production deployment (Railway/Supabase)
// gets TLS by setting it in the connection string, without hardcoding it here and
// breaking self-hosted docker-compose (whose internal pgnet bridge has no TLS).
const client = postgres(databaseUrl, { max: 10 });
export const db = drizzle(client, { schema });
