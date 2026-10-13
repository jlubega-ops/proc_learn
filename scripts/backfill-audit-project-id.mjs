/**
 * One-time fill of `audit_log.project_id` from `meta.projectId` for rows written before the
 * column existed. Safe to run repeatedly (only touches rows where project_id is null).
 *
 *   npm run db:backfill:audit
 */
import { PrismaClient } from "@prisma/client";

try {
  process.loadEnvFile?.();
} catch {
  // .env is optional when variables are already in the environment
}

const prisma = new PrismaClient();
try {
  const updated = await prisma.$executeRaw`
    UPDATE audit_log
    SET project_id = LEFT(JSON_UNQUOTE(JSON_EXTRACT(meta, '$.projectId')), 36)
    WHERE project_id IS NULL
      AND meta IS NOT NULL
      AND JSON_TYPE(JSON_EXTRACT(meta, '$.projectId')) = 'STRING'`;
  console.log(`Audit rows linked to an organisation: ${updated}`);
} finally {
  await prisma.$disconnect();
}
