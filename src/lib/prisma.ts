import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

// Use Neon HTTP fetch transport instead of WebSocket for better serverless compatibility.
neonConfig.poolQueryViaFetch = true;

const globalForPrisma = global as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    // Defer the error to the first query so missing optional env doesn't crash dev.
    console.warn("DATABASE_URL is not set. Prisma queries will fail until it is configured.");
  }

  const adapter = new PrismaNeon({ connectionString: connectionString ?? "" });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
