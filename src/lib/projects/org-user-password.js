import bcrypt from "bcryptjs";
import { PROJECT_ORG_LEARN_PASSWORD } from "@/lib/projects/org-user-identity";

/**
 * @param {string} plain
 */
export async function hashOrgUserPassword(plain) {
  return bcrypt.hash(plain, 12);
}

/**
 * @param {{ passwordHash?: string | null }} orgUser
 * @param {string} plain
 */
export async function verifyOrgUserPassword(orgUser, plain) {
  if (orgUser.passwordHash) {
    return bcrypt.compare(plain, orgUser.passwordHash);
  }
  return plain === PROJECT_ORG_LEARN_PASSWORD;
}
