"use client";

import { mutate } from "swr";

export class ApiError extends Error {
  /** @param {string} message @param {number} status @param {unknown} data */
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

/**
 * Default SWR fetcher: same-origin JSON GET with the session cookie.
 * The browser's HTTP cache revalidates with ETags, so unchanged data costs a tiny 304.
 * @param {string} url
 */
export async function apiFetcher(url) {
  const res = await fetch(url, { credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof data?.error === "string" ? data.error : "Could not load data.";
    throw new ApiError(message, res.status, data);
  }
  return data;
}

/**
 * Re-fetches every cached API response whose URL starts with one of the prefixes
 * (e.g. after a save that other screens also show).
 * @param {...string} prefixes
 */
export function revalidateApi(...prefixes) {
  return mutate(
    (key) => typeof key === "string" && prefixes.some((p) => key.startsWith(p)),
    undefined,
    { revalidate: true, populateCache: false },
  );
}

/** Drops all cached API data and re-fetches mounted screens — used when identity, role, org or committee changes. */
export function clearApiCache() {
  return mutate(() => true, undefined, { revalidate: true });
}

/**
 * True when a DELETE succeeded or the record is already gone (a retried delete on a
 * flaky connection gets 404 because the first attempt went through).
 * @param {Response} res
 */
export function deleteSucceeded(res) {
  return res.ok || res.status === 404;
}
