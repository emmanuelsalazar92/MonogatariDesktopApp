import { defineConfig } from "prisma/config";
import { resolve } from "node:path";

const databasePath = resolve(process.env.MONOGATARI_DATABASE_PATH ?? process.env.MONOGATARI_DATA_DIR ?? "prisma", process.env.MONOGATARI_DATABASE_PATH ? "" : "dev.db");

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: `file:${databasePath}`
  },
  migrations: {
    seed: "node prisma/seed.js"
  }
});
