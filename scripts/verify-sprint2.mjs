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

const diagnosisId = process.argv[2];

async function main() {
  const diagnosis = await prisma.styleDiagnosis.findUnique({
    where: { id: diagnosisId },
    include: {
      photos: true,
      recommendations: true,
    },
  });

  if (!diagnosis) {
    console.error("Diagnosis not found");
    process.exit(1);
  }

  console.log("Diagnosis:", {
    id: diagnosis.id,
    gender: diagnosis.gender,
    age: diagnosis.age,
    heightCm: diagnosis.heightCm,
    weightKg: diagnosis.weightKg,
    status: diagnosis.status,
  });
  console.log("Photo count:", diagnosis.photos.length);
  console.log("Recommendation count:", diagnosis.recommendations.length);
  console.log("Recommendation titles:", diagnosis.recommendations.map((r) => r.title));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
