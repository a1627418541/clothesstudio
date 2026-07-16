import {
  V2_ARCHETYPE_MANIFEST,
  V2ArchetypeCandidate,
  V2ArchetypeManifestEntry,
  validateV2Manifest,
} from "../src/lib/style-archetype/archetype-v2-manifest";
import {
  getV2ReadinessReport,
  V2ReadinessReport,
} from "../src/lib/style-archetype/v2-readiness";

interface SeedTransaction {
  styleArchetype: {
    upsert(args: unknown): Promise<unknown>;
  };
}

export interface SeedDatabase {
  $transaction<T>(
    callback: (tx: SeedTransaction) => Promise<T>,
    options?: { maxWait?: number; timeout?: number }
  ): Promise<T>;
  $disconnect(): Promise<void>;
  styleArchetype: {
    findMany(args?: unknown): Promise<V2ArchetypeCandidate[]>;
  };
}

interface SeedOptions {
  db: SeedDatabase;
  manifest?: readonly V2ArchetypeCandidate[];
}

function toPersistenceData(row: V2ArchetypeManifestEntry) {
  return {
    name: row.name,
    personalityLabel: row.personalityLabel,
    genderScope: row.genderScope,
    category: row.category,
    macroCategory: row.macroCategory,
    description: row.description,
    keywords: row.keywords,
    clothingDNA: row.clothingDNA,
    hairstyleDNA: row.hairstyleDNA,
    shoesDNA: row.shoesDNA,
    colorDNA: row.colorDNA,
    avoidDNA: row.avoidDNA,
    requiredItems: row.requiredItems,
    forbiddenItems: row.forbiddenItems,
    silhouetteDNA: row.silhouetteDNA,
    sceneMood: row.sceneMood,
    vibeAliases: row.vibeAliases,
    clothingMatchTerms: row.clothingMatchTerms,
    sceneMatchTerms: row.sceneMatchTerms,
    personalityTerms: row.personalityTerms,
    preferredBodyTypes: row.preferredBodyTypes,
    preferredFaceShapes: row.preferredFaceShapes,
    ageMin: row.ageMin,
    ageMax: row.ageMax,
    imagePromptTemplate: row.imagePromptTemplate,
    version: row.version,
    active: row.active,
  };
}

export async function seedStyleArchetypes({
  db,
  manifest = V2_ARCHETYPE_MANIFEST,
}: SeedOptions): Promise<V2ReadinessReport> {
  const validation = validateV2Manifest(manifest);
  if (!validation.valid) {
    throw new Error(
      `Archetype V2 manifest validation failed: ${JSON.stringify(validation.errors)}`
    );
  }
  const rows = manifest as readonly V2ArchetypeManifestEntry[];

  await db.$transaction(
    async (tx) => {
      for (const row of rows) {
        const data = toPersistenceData(row);
        await tx.styleArchetype.upsert({
          where: { slug: row.slug },
          update: data,
          create: { slug: row.slug, ...data },
        });
      }
    },
    { maxWait: 10_000, timeout: 60_000 }
  );

  const persistedRows = await db.styleArchetype.findMany({
    where: { slug: { in: rows.map((row) => row.slug) } },
  });
  const readiness = getV2ReadinessReport(persistedRows);
  if (!readiness.ready) {
    throw new Error(
      `Archetype V2 readiness verification failed: ${JSON.stringify(readiness)}`
    );
  }

  return readiness;
}

export interface SeedCommandOptions {
  args?: readonly string[];
  manifest?: readonly V2ArchetypeCandidate[];
  loadDatabase?: () => Promise<SeedDatabase>;
}

async function loadDefaultDatabase(): Promise<SeedDatabase> {
  const { prisma } = await import("../src/lib/prisma");
  return prisma as unknown as SeedDatabase;
}

export async function runSeedCommand({
  args = process.argv.slice(2),
  manifest = V2_ARCHETYPE_MANIFEST,
  loadDatabase = loadDefaultDatabase,
}: SeedCommandOptions = {}): Promise<V2ReadinessReport> {
  const validation = validateV2Manifest(manifest);
  if (!validation.valid) {
    throw new Error(
      `Archetype V2 manifest validation failed: ${JSON.stringify(validation.errors)}`
    );
  }

  if (args.includes("--validate-only")) {
    return getV2ReadinessReport(manifest);
  }

  const db = await loadDatabase();
  try {
    return await seedStyleArchetypes({ db, manifest });
  } finally {
    await db.$disconnect();
  }
}

export function getSeedSuccessMessage(
  report: V2ReadinessReport,
  validateOnly: boolean
): string {
  return validateOnly
    ? `Validated ${report.eligibleArchetypeCount} Archetype V2 rows; no database writes.`
    : `Validated and seeded ${report.eligibleArchetypeCount} Archetype V2 rows.`;
}

async function main() {
  const validateOnly = process.argv.slice(2).includes("--validate-only");
  const report = await runSeedCommand();
  console.log(getSeedSuccessMessage(report, validateOnly));
}

const executedFile = process.argv[1]?.replace(/\\/g, "/");
if (executedFile?.endsWith("/prisma/seed-style-archetypes.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
