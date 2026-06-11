// Public contract surface for @oms/db.
// Exposes a single PrismaClient factory + re-exports generated types.
// Consumers MUST go through this entrypoint; importing @prisma/client directly
// from app code is forbidden (caught by the boundaries lint rules).
import { PrismaClient, Prisma } from "@prisma/client";

export type { Prisma } from "@prisma/client";

// Runtime Decimal class for money-safe arithmetic in services (app code must
// not import @prisma/client directly — boundary rule).
export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

let client: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  if (!client) {
    client = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["warn", "error"]
    });
  }
  return client;
}
