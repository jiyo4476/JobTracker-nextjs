import { afterEach, describe, expect, it, vi } from "vitest";

const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  vi.resetModules();
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

describe("database initialization", () => {
  it("allows server modules to be imported without DATABASE_URL", async () => {
    delete process.env.DATABASE_URL;

    await expect(import("@/db")).resolves.toHaveProperty("db");
  });

  it("fails closed when runtime code accesses the database without DATABASE_URL", async () => {
    delete process.env.DATABASE_URL;
    const { db, MissingDatabaseUrlError } = await import("@/db");

    expect(() => db.select).toThrow(MissingDatabaseUrlError);
  });

  it("creates the database interface lazily when DATABASE_URL is configured", async () => {
    process.env.DATABASE_URL = "postgresql://build-test:build-test@127.0.0.1:1/build-test";
    const { db } = await import("@/db");

    expect(db.select).toBeTypeOf("function");
  });
});
