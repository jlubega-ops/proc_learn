import crypto from "node:crypto";
import { AuthTokenType, UserAccountStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * @param {string} rawToken
 */
export function hashAuthToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/**
 * @param {string} userId
 * @param {import("@prisma/client").AuthTokenType} type
 * @param {number} ttlMs
 * @returns {Promise<{ rawToken: string; expiresAt: Date }>}
 */
export async function createAuthTokenRecord(userId, type, ttlMs) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashAuthToken(rawToken);
  const expiresAt = new Date(Date.now() + ttlMs);

  await prisma.$transaction([
    prisma.authToken.deleteMany({
      where: {
        userId,
        type,
        usedAt: null,
      },
    }),
    prisma.authToken.create({
      data: {
        userId,
        tokenHash,
        type,
        expiresAt,
      },
    }),
  ]);

  return { rawToken, expiresAt };
}

/**
 * @param {string} rawToken
 * @param {import("@prisma/client").AuthTokenType} type
 */
export async function findValidAuthToken(rawToken, type) {
  const tokenHash = hashAuthToken(rawToken);
  return prisma.authToken.findFirst({
    where: {
      tokenHash,
      type,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
}

/**
 * Check account-activation token without consuming it (for UI gating + clearer POST errors).
 * @param {string} rawToken
 * @returns {Promise<
 *   | { ok: false; code: "invalid" | "expired" | "used" | "suspended" | "already_active" }
 *   | { ok: true; tokenId: string; userId: string }
 * >}
 */
export async function inspectActivationToken(rawToken) {
  const trimmed = typeof rawToken === "string" ? rawToken.trim() : "";
  if (!trimmed) {
    return { ok: false, code: "invalid" };
  }

  const tokenHash = hashAuthToken(trimmed);
  const row = await prisma.authToken.findFirst({
    where: {
      tokenHash,
      type: AuthTokenType.ACCOUNT_ACTIVATION,
    },
  });
  if (!row) {
    return { ok: false, code: "invalid" };
  }

  const user = await prisma.user.findUnique({
    where: { id: row.userId },
    select: { accountStatus: true, activatedAt: true },
  });
  if (!user) {
    return { ok: false, code: "invalid" };
  }
  if (user.accountStatus === UserAccountStatus.SUSPENDED) {
    return { ok: false, code: "suspended" };
  }
  if (row.usedAt) {
    return { ok: false, code: "used" };
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    return { ok: false, code: "expired" };
  }
  if (user.activatedAt || user.accountStatus === UserAccountStatus.ACTIVE) {
    return { ok: false, code: "already_active" };
  }

  return { ok: true, tokenId: row.id, userId: row.userId };
}
