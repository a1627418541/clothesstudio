import { defineConfig } from "prisma/config";

type Env = typeof process.env & {
  DATABASE_URL: string;
};

export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: {
    url: ({ env }: { env: Env }) => env.DATABASE_URL,
  },
});
