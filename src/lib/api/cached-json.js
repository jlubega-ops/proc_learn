import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * JSON response for cached reads. Only use after authorization.
 *
 * Default: `private, no-store` — nothing is written to the browser's disk cache (shared lab PCs).
 * `revalidate: true` (non-personal reference/config data only — never names, emails, student
 * numbers): the browser may keep a copy and revalidate with an ETag, so unchanged data costs a
 * bodiless 304 on slow connections. Logout clears it via `Clear-Site-Data`.
 *
 * @param {Request} request
 * @param {unknown} payload
 * @param {{ status?: number; revalidate?: boolean }} [init]
 */
export function cachedJson(request, payload, { status = 200, revalidate = false } = {}) {
  const body = JSON.stringify(payload);
  if (!revalidate) {
    return new NextResponse(body, {
      status,
      headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
    });
  }
  const etag = `W/"${createHash("sha1").update(body).digest("base64url")}"`;
  const headers = {
    ETag: etag,
    "Cache-Control": "private, no-cache",
    Vary: "Cookie",
  };
  const inm = request.headers.get("if-none-match");
  if (status === 200 && inm && inm.split(",").some((t) => t.trim() === etag)) {
    return new NextResponse(null, { status: 304, headers });
  }
  return new NextResponse(body, {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
