import { ProjectPurpose, ProjectVisibility, Role } from "@prisma/client";

const PURPOSE_VALUES = new Set(Object.values(ProjectPurpose));
const VISIBILITY_VALUES = new Set(Object.values(ProjectVisibility));

/**
 * @param {unknown} value
 * @returns {string}
 */
function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

const ACCESS_KEY_REGEX = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/;

/**
 * @param {unknown} value
 */
function normalizeAccessKey(value) {
  return cleanText(value).toUpperCase();
}

/**
 * Supports "90", "90m", "1h 30m", "1:30", "2h", "45min", "01:15:30".
 * Returns null when empty, NaN when invalid.
 * @param {unknown} raw
 * @returns {number | null}
 */
export function parseDurationToSeconds(raw) {
  const input = cleanText(raw).toLowerCase();
  if (!input) return null;

  if (/^\d+$/.test(input)) {
    return Number(input) * 60;
  }

  const hhmmss = input.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (hhmmss) {
    const h = Number(hhmmss[1] || 0);
    const m = Number(hhmmss[2] || 0);
    const s = Number(hhmmss[3] || 0);
    if (m > 59 || s > 59) return Number.NaN;
    return h * 3600 + m * 60 + s;
  }

  let total = 0;
  const regex = /(\d+)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)\b/g;
  let matchFound = false;
  let match;
  while ((match = regex.exec(input)) !== null) {
    matchFound = true;
    const n = Number(match[1]);
    const unit = match[2];
    if (unit.startsWith("h")) total += n * 3600;
    else if (unit.startsWith("m")) total += n * 60;
    else total += n;
  }
  if (matchFound && total > 0) return total;
  return Number.NaN;
}

/**
 * @param {unknown} value
 * @returns {Date | null}
 */
function parseDate(value) {
  const v = cleanText(value);
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * @param {{
 *  body: any;
 *  activeRole: import("@prisma/client").Role;
 * }} input
 */
export function validateProjectCreateInput({ body, activeRole }) {
  /** @type {Record<string, string>} */
  const errors = {};

  const name = cleanText(body?.name);
  const description = cleanText(body?.description);
  const organizationName = cleanText(body?.organizationName);
  const instructions = cleanText(body?.instructions);
  const questionText = cleanText(body?.questionText);
  const questionFileUrl = cleanText(body?.questionFileUrl);
  const enrollmentAccessKey = normalizeAccessKey(body?.enrollmentAccessKey);
  const purposeIn = cleanText(body?.purpose).toUpperCase();
  const visibilityIn = cleanText(body?.visibility).toUpperCase();

  if (!name) errors.name = "Project name is required.";
  if (name.length > 255) errors.name = "Project name is too long.";

  let purpose = PURPOSE_VALUES.has(purposeIn) ? purposeIn : ProjectPurpose.PRACTICE;
  let visibility = VISIBILITY_VALUES.has(visibilityIn)
    ? visibilityIn
    : ProjectVisibility.PRIVATE;

  if (activeRole === Role.STUDENT) {
    purpose = ProjectPurpose.PRACTICE;
    if (!organizationName) errors.organizationName = "Organisation name is required.";
  }

  const openAt = parseDate(body?.openAt);
  const closeAt = parseDate(body?.closeAt);
  if (cleanText(body?.openAt) && !openAt) errors.openAt = "Open date is invalid.";
  if (cleanText(body?.closeAt) && !closeAt) errors.closeAt = "Close date is invalid.";
  if (openAt && closeAt && closeAt <= openAt) {
    errors.closeAt = "Close date must be after open date.";
  }

  const durationSeconds = parseDurationToSeconds(body?.duration);
  if (durationSeconds !== null && (!Number.isFinite(durationSeconds) || durationSeconds <= 0)) {
    errors.duration = "Duration format is invalid.";
  }
  if (purpose === ProjectPurpose.ASSIGNMENT && (durationSeconds === null || durationSeconds <= 0)) {
    errors.duration = "Duration is required for assignment projects.";
  }

  if (
    questionFileUrl &&
    !/^https?:\/\//i.test(questionFileUrl) &&
    !questionFileUrl.startsWith("/api/media/")
  ) {
    errors.questionFileUrl =
      "Question file link must start with http(s):// or be a protected /api/media URL.";
  }

  if (activeRole !== Role.STUDENT && enrollmentAccessKey && !ACCESS_KEY_REGEX.test(enrollmentAccessKey)) {
    errors.enrollmentAccessKey =
      "Enrollment key must be exactly 5 characters, uppercase letters/numbers only (no 0,1,I,O).";
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    data: {
      name,
      description: description || null,
      organizationName: organizationName || null,
      purpose,
      visibility,
      instructions: instructions || null,
      questionText: questionText || null,
      questionFileUrl: questionFileUrl || null,
      enrollmentAccessKey: activeRole === Role.STUDENT ? null : enrollmentAccessKey || null,
      openAt,
      closeAt,
      durationSeconds: durationSeconds ?? null,
      isPublished: body?.isPublished === true,
    },
  };
}

