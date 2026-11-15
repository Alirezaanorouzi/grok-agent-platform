import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import pg from "pg";
import { config } from "./config.js";

let prismaInstance: PrismaClient | undefined;

function createPrisma(): PrismaClient {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export function getPrisma(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = createPrisma();
  }
  return prismaInstance;
}

export { BuildRunStatus, type WorkspaceStatus } from "./generated/prisma/client.js";