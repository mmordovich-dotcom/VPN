import { PrismaClient } from '@prisma/client';
export { PrismaClient, Prisma } from '@prisma/client';
export type { BackgroundJob } from '@prisma/client';
export function createDatabase(url: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url } }, log: [] });
}
