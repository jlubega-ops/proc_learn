import { PrismaClient } from "@prisma/client";
import { noteModelWrite, trackTransaction } from "@/lib/server-cache";

const globalForPrisma = globalThis;

function createClient() {
  const extended = new PrismaClient().$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args);
          noteModelWrite(model, operation);
          return result;
        },
      },
    },
  });
  // Re-clear cached reads after commit so reads that raced an open transaction are dropped.
  return new Proxy(extended, {
    get(target, prop) {
      if (prop === "$transaction") {
        return (...args) => trackTransaction(() => target.$transaction(...args));
      }
      return Reflect.get(target, prop);
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
