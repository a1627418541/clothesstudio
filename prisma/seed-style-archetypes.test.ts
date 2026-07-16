import { describe, expect, it, vi } from "vitest";
import { V2_ARCHETYPE_MANIFEST } from "../src/lib/style-archetype/archetype-v2-manifest";
import {
  getSeedSuccessMessage,
  runSeedCommand,
  seedStyleArchetypes,
} from "./seed-style-archetypes";

function makeDatabase(readinessRows = V2_ARCHETYPE_MANIFEST) {
  const upsert = vi.fn().mockResolvedValue({});
  const transaction = vi.fn(async (callback) =>
    callback({ styleArchetype: { upsert } })
  );
  const findMany = vi.fn().mockResolvedValue(readinessRows);
  const disconnect = vi.fn().mockResolvedValue(undefined);

  return {
    db: {
      $transaction: transaction,
      $disconnect: disconnect,
      styleArchetype: { findMany },
    },
    disconnect,
    findMany,
    transaction,
    upsert,
  };
}

describe("V2 archetype seed", () => {
  it("validates in memory without loading Prisma", async () => {
    const loadDatabase = vi.fn();
    const result = await runSeedCommand({
      args: ["--validate-only"],
      loadDatabase,
    });

    expect(result.ready).toBe(true);
    expect(result.eligibleArchetypeCount).toBe(20);
    expect(loadDatabase).not.toHaveBeenCalled();
    expect(getSeedSuccessMessage(result, true)).toBe(
      "Validated 20 Archetype V2 rows; no database writes."
    );
  });

  it("performs zero writes when prevalidation fails", async () => {
    const fixture = makeDatabase();
    const invalidManifest = V2_ARCHETYPE_MANIFEST.map((row) =>
      row.slug === "old-money" ? { ...row, version: 1 } : row
    );

    await expect(
      seedStyleArchetypes({ db: fixture.db, manifest: invalidManifest })
    ).rejects.toThrow("Archetype V2 manifest validation failed");
    expect(fixture.transaction).not.toHaveBeenCalled();
    expect(fixture.findMany).not.toHaveBeenCalled();
  });

  it("upserts all rows in one transaction then verifies readiness", async () => {
    const fixture = makeDatabase();
    const report = await seedStyleArchetypes({ db: fixture.db });

    expect(fixture.transaction).toHaveBeenCalledTimes(1);
    expect(fixture.transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 10_000,
      timeout: 60_000,
    });
    expect(fixture.upsert).toHaveBeenCalledTimes(20);
    expect(fixture.findMany).toHaveBeenCalledTimes(1);
    expect(report.ready).toBe(true);
  });

  it("reports failed post-transaction readiness", async () => {
    const fixture = makeDatabase(
      V2_ARCHETYPE_MANIFEST.filter((row) => row.slug !== "streetwear")
    );

    await expect(seedStyleArchetypes({ db: fixture.db })).rejects.toThrow(
      "Archetype V2 readiness verification failed"
    );
    expect(fixture.transaction).toHaveBeenCalledTimes(1);
    expect(fixture.upsert).toHaveBeenCalledTimes(20);
  });
});
