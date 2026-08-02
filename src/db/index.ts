import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/** Thrown when a database operation is attempted without DATABASE_URL. */
export class MissingDatabaseUrlError extends Error {
  constructor() {
    super(
      "DATABASE_URL is not set. Provide a PostgreSQL connection string via the environment before starting the app.",
    );
    this.name = "MissingDatabaseUrlError";
  }
}

// `postgres-js` already reads `sslmode` off DATABASE_URL's query string (e.g.
// `?sslmode=require`), so a managed-Postgres production deployment (Railway/Supabase)
// gets TLS by setting it in the connection string, without hardcoding it here and
// breaking self-hosted docker-compose (whose internal pgnet bridge has no TLS).
function createDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new MissingDatabaseUrlError();
  }

  const client = postgres(databaseUrl, { max: 10 });
  return drizzle(client, { schema });
}

type Database = ReturnType<typeof createDatabase>;

let database: Database | undefined;

function getDatabase(): Database {
  database ??= createDatabase();
  return database;
}

// Next.js imports route modules while compiling. Delay environment validation and
// client creation until a route actually uses the database so builds stay offline,
// while runtime database access still fails closed when configuration is missing.
export const db = new Proxy({} as Database, {
  get(_target, property) {
    const activeDatabase = getDatabase();
    const value = Reflect.get(activeDatabase, property, activeDatabase);
    return typeof value === "function" ? value.bind(activeDatabase) : value;
  },
  has(_target, property) {
    return Reflect.has(getDatabase(), property);
  },
  ownKeys() {
    return Reflect.ownKeys(getDatabase());
  },
  getOwnPropertyDescriptor(_target, property) {
    const activeDatabase = getDatabase();
    const descriptor = Reflect.getOwnPropertyDescriptor(activeDatabase, property);
    if (!descriptor) return undefined;

    // The proxy target is intentionally empty and extensible. Report reflected
    // database properties as configurable so the descriptor remains compatible
    // with that target while preserving the active database's other attributes.
    return {
      ...descriptor,
      configurable: true,
      ...(typeof descriptor.value === "function"
        ? { value: descriptor.value.bind(activeDatabase) }
        : {}),
    };
  },
});
