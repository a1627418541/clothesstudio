import { describe, expect, it } from "vitest";
import { V2_ARCHETYPE_MANIFEST } from "./archetype-v2-manifest";
import { getCompatibleGenderScopes, getV2ReadinessReport } from "./v2-readiness";

describe("Archetype V2 readiness", () => {
  it("uses the exact non-wildcard GenderScope matrix", () => {
    expect(getCompatibleGenderScopes("MALE")).toEqual(["MALE", "UNISEX"]);
    expect(getCompatibleGenderScopes("FEMALE")).toEqual(["FEMALE", "UNISEX"]);
    expect(getCompatibleGenderScopes("OTHER")).toEqual(["OTHER", "UNISEX"]);
  });

  it("reports the complete manifest ready for every user pool", () => {
    const report = getV2ReadinessReport(V2_ARCHETYPE_MANIFEST);
    expect(report.ready).toBe(true);
    expect(report.expectedArchetypeCount).toBe(20);
    expect(report.eligibleArchetypeCount).toBe(20);
    expect(report.missingExpectedSlugs).toEqual([]);
    expect(report.invalidArchetypes).toEqual([]);
    expect(report.pools.MALE.eligibleCount).toBe(10);
    expect(report.pools.FEMALE.eligibleCount).toBe(13);
    expect(report.pools.OTHER).toEqual({
      eligibleCount: 3,
      macroCategories: ["DAILY_CLEAN", "URBAN_STREET", "ARTISTIC_MINIMAL"],
      ready: true,
    });
    expect(Object.values(report.pools).every((pool) => pool.macroCategories.length >= 3)).toBe(true);
  });

  it("fails closed when an expected slug is missing", () => {
    const rows = V2_ARCHETYPE_MANIFEST.filter((row) => row.slug !== "streetwear");
    const report = getV2ReadinessReport(rows);
    expect(report.ready).toBe(false);
    expect(report.missingExpectedSlugs).toEqual(["streetwear"]);
    expect(report.pools.OTHER.ready).toBe(false);
  });

  it("reports invalid V2 rows instead of counting them eligible", () => {
    const rows = V2_ARCHETYPE_MANIFEST.map((row) =>
      row.slug === "old-money" ? { ...row, version: 1 } : row
    );
    const report = getV2ReadinessReport(rows);
    expect(report.ready).toBe(false);
    expect(report.eligibleArchetypeCount).toBe(19);
    expect(report.invalidArchetypes).toEqual([
      { archetypeId: "old-money", reasonCodes: ["UNSUPPORTED_VERSION"] },
    ]);
  });
});
