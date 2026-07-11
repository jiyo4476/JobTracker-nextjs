import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// `postgres-js` already reads `sslmode` off DATABASE_URL's query string (e.g.
// `?sslmode=require`), so a managed-Postgres production deployment (Railway/Supabase)
// gets TLS by setting it in the connection string, without hardcoding it here and
// breaking self-hosted docker-compose (whose internal pgnet bridge has no TLS).
const client = postgres(process.env.DATABASE_URL!, { max: 10 });
export const db = drizzle(client, { schema });
