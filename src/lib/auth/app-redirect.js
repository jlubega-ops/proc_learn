import { NextResponse } from "next/server";
import { appAbsoluteUrl, getAppBaseUrl } from "@/lib/appConfig";

/**
 * Browser redirect to a path on the configured public origin (`APP_URL`).
 * @param {string} pathAndSearch
 */
export function redirectToAppPath(pathAndSearch) {
  const path = String(pathAndSearch || "/").startsWith("/")
    ? String(pathAndSearch || "/")
    : `/${pathAndSearch}`;
  if (!getAppBaseUrl()) {
    return NextResponse.redirect(path);
  }
  return NextResponse.redirect(appAbsoluteUrl(path));
}
