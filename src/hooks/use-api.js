"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { useToast } from "@/components/providers/toast-provider";
import { ApiError } from "@/lib/api-client-cache";

/**
 * Cached GET for a JSON API. Revisits render the last data instantly and refresh quietly.
 *
 * - `loading`: first load only (no cached data yet) — show skeletons/spinners.
 * - `refreshing`: an explicit `reload()` is in flight (background revalidation never blocks the UI).
 * - `reload()`: re-fetch now; await it after a save so the screen shows the saved data.
 *
 * @param {string | null | false | undefined} url  falsy = don't fetch
 * @param {{ errorMessage?: string; silentErrors?: boolean; refreshInterval?: number }} [opts]
 */
export function useApi(url, { errorMessage, silentErrors = false, refreshInterval } = {}) {
  const { showToast } = useToast();
  const { data, error, isLoading, isValidating, mutate } = useSWR(url || null, {
    refreshInterval,
  });

  const lastToasted = useRef(/** @type {unknown} */ (null));
  useEffect(() => {
    if (!error || silentErrors || lastToasted.current === error) return;
    lastToasted.current = error;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const fromApi = error instanceof ApiError && error.data?.error ? error.message : "";
    showToast({ message: fromApi || errorMessage || "Could not load data.", severity: "error" });
  }, [error, errorMessage, showToast, silentErrors]);

  const [reloads, setReloads] = useState(0);
  const reload = useCallback(async () => {
    setReloads((n) => n + 1);
    try {
      return await mutate();
    } finally {
      setReloads((n) => n - 1);
    }
  }, [mutate]);

  return {
    data,
    error,
    loading: Boolean(isLoading),
    refreshing: reloads > 0,
    validating: Boolean(isValidating),
    reload,
    mutate,
  };
}
