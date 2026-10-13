"use client";

import { SWRConfig } from "swr";
import { apiFetcher } from "@/lib/api-client-cache";

/** 4xx answers will not change on retry; network and 5xx errors back off and retry. */
function onErrorRetry(error, _key, _config, revalidate, { retryCount }) {
  const status = Number(error?.status) || 0;
  if (status >= 400 && status < 500) return;
  if (retryCount >= 3) return;
  setTimeout(() => revalidate({ retryCount }), Math.min(30_000, 2_000 * 2 ** retryCount));
}

const SWR_OPTIONS = {
  fetcher: apiFetcher,
  dedupingInterval: 5_000,
  focusThrottleInterval: 60_000,
  revalidateOnReconnect: true,
  keepPreviousData: true,
  onErrorRetry,
};

/** @param {{ children: import("react").ReactNode }} props */
export function SwrProvider({ children }) {
  return <SWRConfig value={SWR_OPTIONS}>{children}</SWRConfig>;
}
