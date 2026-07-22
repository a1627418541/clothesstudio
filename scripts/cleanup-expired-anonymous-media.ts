import { prisma } from "../src/lib/prisma";
import { deleteObjectFromR2 } from "../src/lib/r2";
import {
  cleanupExpiredAnonymousMedia,
  type AnonymousMediaRetentionClient,
} from "../src/lib/retention/anonymous-media-retention";

async function main() {
  try {
    const result = await cleanupExpiredAnonymousMedia({
      client: prisma as unknown as AnonymousMediaRetentionClient,
      deleteObject: deleteObjectFromR2,
      now: new Date(),
    });
    console.log(
      JSON.stringify({
        diagnosesScanned: result.diagnosesScanned,
        diagnosesExpired: result.diagnosesExpired,
        objectsDeleted: result.objectsDeleted,
        errorCount: result.errors.length,
      })
    );
  } catch {
    console.error("Anonymous media cleanup failed.");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
