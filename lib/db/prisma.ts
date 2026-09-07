import { join, resolve } from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/lib/generated/prisma/client";

type PrismaClientInstance = InstanceType<typeof PrismaClient>;

// Test processes set MONOGATARI_DATABASE_PATH to a fresh OS-temporary path.
// Fail closed if somebody invokes `node --test` without the isolated runner:
// tests must never silently fall back to the developer's manuscript database.
const testProcess = process.execArgv.includes("--test");
if (testProcess && !process.env.MONOGATARI_DATABASE_PATH) {
  throw new Error("Tests require MONOGATARI_DATABASE_PATH; run npm test instead of opening prisma/dev.db.");
}

// Production and normal development retain the established local database.
export const runtimeDataDirectory = process.env.MONOGATARI_DATA_DIR
  ? resolve(process.env.MONOGATARI_DATA_DIR)
  : join(process.cwd(), "prisma");

export const databasePath = process.env.MONOGATARI_DATABASE_PATH
  ? resolve(process.env.MONOGATARI_DATABASE_PATH)
  : join(runtimeDataDirectory, "dev.db");

const adapter = new PrismaBetterSqlite3({ url: databasePath });

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClientInstance;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
