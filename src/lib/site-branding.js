import { randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { cachedRead } from "@/lib/server-cache";
import { getUploadRoot, resolveStoredFilePath } from "@/lib/upload-path";
import { DEFAULT_BACKGROUND_URL, DEFAULT_LOGO_URL, DEFAULT_SITE_BRANDING } from "@/lib/site-branding-defaults";

const SETTINGS_KEY = "default";

export const BRANDING_KINDS = Object.freeze({
  logo: {
    label: "Logo",
    maxBytes: 1024 * 1024,
    defaultUrl: DEFAULT_LOGO_URL,
    keyField: "logoStorageKey",
    mimeField: "logoMimeType",
  },
  background: {
    label: "Background image",
    maxBytes: 5 * 1024 * 1024,
    defaultUrl: DEFAULT_BACKGROUND_URL,
    keyField: "backgroundStorageKey",
    mimeField: "backgroundMimeType",
  },
});

const EXT_BY_MIME = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** @param {unknown} kind @returns {kind is keyof typeof BRANDING_KINDS} */
export function isBrandingKind(kind) {
  return typeof kind === "string" && Object.prototype.hasOwnProperty.call(BRANDING_KINDS, kind);
}

/**
 * Detects PNG / JPEG / WebP from the file signature (never trust the declared type).
 * SVG is deliberately unsupported: it can carry scripts.
 * @param {Buffer} buf
 */
export function detectImageMime(buf) {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("latin1") === "RIFF" &&
    buf.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/** @param {string | null | undefined} storageKey */
function fileIdOf(storageKey) {
  return storageKey ? path.basename(storageKey).replace(/\.[a-z0-9]+$/i, "") : "";
}

/** @param {keyof typeof BRANDING_KINDS} kind @param {string | null | undefined} storageKey */
function urlFor(kind, storageKey) {
  const id = fileIdOf(storageKey);
  return id ? `/api/site/branding/${kind}/${id}` : BRANDING_KINDS[kind].defaultUrl;
}

async function readBrandingRow() {
  return prisma.siteSetting.findUnique({
    where: { key: SETTINGS_KEY },
    select: {
      logoStorageKey: true,
      logoMimeType: true,
      backgroundStorageKey: true,
      backgroundMimeType: true,
    },
  });
}

/**
 * Logo / background URLs for every page. Versioned URLs (new id per upload) let browsers and
 * Nginx cache the images forever. Falls back to the bundled MUBS images if anything fails.
 */
export async function getSiteBranding() {
  try {
    return await cachedRead("site-branding", ["SiteSetting"], async () => {
      const row = await readBrandingRow();
      return {
        logoUrl: urlFor("logo", row?.logoStorageKey),
        backgroundUrl: urlFor("background", row?.backgroundStorageKey),
        logoCustom: Boolean(row?.logoStorageKey),
        backgroundCustom: Boolean(row?.backgroundStorageKey),
      };
    });
  } catch {
    return { ...DEFAULT_SITE_BRANDING };
  }
}

/**
 * Current file for a branding kind, or null when `fileId` is not the current upload.
 * @param {keyof typeof BRANDING_KINDS} kind
 * @param {string} fileId
 */
export async function findBrandingFile(kind, fileId) {
  const row = await cachedRead("site-branding:files", ["SiteSetting"], readBrandingRow);
  const cfg = BRANDING_KINDS[kind];
  const storageKey = row?.[cfg.keyField];
  if (!storageKey || fileIdOf(storageKey) !== fileId) return null;
  const absolute = resolveStoredFilePath(storageKey);
  return absolute ? { absolute, mimeType: row?.[cfg.mimeField] || "application/octet-stream" } : null;
}

/** @param {string | null | undefined} storageKey */
async function removeStoredFile(storageKey) {
  const absolute = storageKey ? resolveStoredFilePath(storageKey) : null;
  if (!absolute) return;
  await unlink(absolute).catch(() => {});
}

/**
 * Validates and stores a new branding image, replacing the previous upload.
 * @param {keyof typeof BRANDING_KINDS} kind
 * @param {Buffer} buffer
 * @param {string} actorUserId
 * @returns {Promise<{ ok: true } | { ok: false; error: string }>}
 */
export async function saveBrandingImage(kind, buffer, actorUserId) {
  const cfg = BRANDING_KINDS[kind];
  if (!buffer.length) return { ok: false, error: "Choose an image." };
  if (buffer.length > cfg.maxBytes) {
    return { ok: false, error: `${cfg.label} must be ${Math.round(cfg.maxBytes / 1024 / 1024)}MB or smaller.` };
  }
  const mimeType = detectImageMime(buffer);
  if (!mimeType) return { ok: false, error: "Use a PNG, JPG or WebP image." };

  const storageKey = path.join("branding", `${kind}-${randomUUID()}.${EXT_BY_MIME[mimeType]}`);
  const absolute = path.resolve(getUploadRoot(), storageKey);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, buffer);

  let previous = null;
  try {
    previous = (await readBrandingRow())?.[cfg.keyField] || null;
    const data = { [cfg.keyField]: storageKey, [cfg.mimeField]: mimeType, updatedByUserId: actorUserId };
    await prisma.siteSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, ...data },
      update: data,
    });
  } catch (e) {
    await removeStoredFile(storageKey);
    throw e;
  }
  await removeStoredFile(previous);
  return { ok: true };
}

/**
 * Goes back to the bundled default image.
 * @param {keyof typeof BRANDING_KINDS} kind
 * @param {string} actorUserId
 */
export async function resetBrandingImage(kind, actorUserId) {
  const cfg = BRANDING_KINDS[kind];
  const previous = (await readBrandingRow())?.[cfg.keyField] || null;
  if (!previous) return;
  await prisma.siteSetting.update({
    where: { key: SETTINGS_KEY },
    data: { [cfg.keyField]: null, [cfg.mimeField]: null, updatedByUserId: actorUserId },
  });
  await removeStoredFile(previous);
}
