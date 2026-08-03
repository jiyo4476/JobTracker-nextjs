import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  companies,
  jobs,
  resumeVersions,
  userJobContacts,
  userJobState,
  userJobStatusHistory,
} from "@/db/schema";

describe("DB-002 owner-scoped job state schema", () => {
  it("keeps catalog tables global and gives every personal table direct ownership", () => {
    expect(getTableConfig(jobs).columns.map((column) => column.name)).not.toContain("user_id");
    expect(getTableConfig(companies).columns.map((column) => column.name)).not.toContain("user_id");
    for (const table of [userJobState, userJobContacts, userJobStatusHistory]) {
      const config = getTableConfig(table);
      expect(config.columns.map((column) => column.name)).toContain("user_id");
      const indexedFirst = config.indexes.some(
        (index) => {
          const first = index.config.columns[0];
          return Boolean(first && "name" in first && first.name === "user_id");
        },
      );
      const primaryKeyFirst = config.primaryKeys.some(
        (primaryKey) => primaryKey.columns[0]?.name === "user_id",
      );
      expect(indexedFirst || primaryKeyFirst).toBe(true);
    }
  });

  it("stores the complete private application state", () => {
    expect(getTableConfig(userJobState).columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "priority", "is_hidden", "has_applied", "date_applied", "heard_back",
        "interview_stage", "referral", "cover_letter_submitted", "resume_version_id",
        "rejection_reason", "notes", "created_at", "updated_at",
      ]),
    );
  });

  it("uses composite user/job parents for contacts and status history", () => {
    for (const table of [userJobContacts, userJobStatusHistory]) {
      const foreignKeys = getTableConfig(table).foreignKeys;
      expect(
        foreignKeys.some((foreignKey) =>
          foreignKey.reference().columns.map((column) => column.name).join(",") ===
          "user_id,job_id"),
      ).toBe(true);
    }
  });

  it("enforces owner-matching resume references", () => {
    const stateForeignKeys = getTableConfig(userJobState).foreignKeys;
    const ownerResumeForeignKey = stateForeignKeys.find(
      (foreignKey) => foreignKey.reference().foreignTable === resumeVersions,
    );

    expect(ownerResumeForeignKey?.reference().columns.map((column) => column.name)).toEqual([
      "user_id",
      "resume_version_id",
    ]);
    expect(ownerResumeForeignKey?.reference().foreignColumns.map((column) => column.name)).toEqual([
      "user_id",
      "id",
    ]);
    expect(
      getTableConfig(resumeVersions).indexes.some(
        (index) => index.config.unique &&
          index.config.columns.map((column) => "name" in column ? column.name : null).join(",") ===
            "user_id,id",
      ),
    ).toBe(true);
  });
});
