import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

neonConfig.poolQueryViaFetch = true;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const adapter = new PrismaNeon({ connectionString });
const prisma = new PrismaClient({ adapter });

const anonymousSessionId = process.argv[2];

async function main() {
  const assets = await prisma.mediaAsset.findMany({
    where: anonymousSessionId ? { anonymousSessionId } : {},
    orderBy: { createdAt: "asc" },
    take: 10,
  });

  console.log(
    JSON.stringify(
      assets.map((a) => ({
        id: a.id,
        anonymousSessionId: a.anonymousSessionId,
        userId: a.userId,
        type: a.type,
        url: a.url,
        status: a.status,
        mimeType: a.mimeType,
        size: a.size,
      })),
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
