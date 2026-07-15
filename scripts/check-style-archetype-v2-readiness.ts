import { prisma } from "../src/lib/prisma";
import { V2_ARCHETYPE_SLUGS } from "../src/lib/style-archetype/archetype-v2-manifest";
import { getV2ReadinessReport } from "../src/lib/style-archetype/v2-readiness";

async function main() {
  const rows = await prisma.styleArchetype.findMany({
    where: { slug: { in: [...V2_ARCHETYPE_SLUGS] } },
  });
  const report = getV2ReadinessReport(rows);
  console.log(JSON.stringify(report, null, 2));

  if (!report.ready) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
