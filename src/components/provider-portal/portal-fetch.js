"use client";

import { useEffect, useState } from "react";
import { format, isValid } from "date-fns";

/** Session expired / revoked: send the provider back to sign in. */
function handleUnauthorized() {
  if (typeof window !== "undefined") window.location.replace("/login?reason=idle");
}

/**
 * @param {string} url
 * @param {RequestInit} [init]
 */
export async function portalFetch(url, init = {}) {
  const res = await fetch(url, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) handleUnauthorized();
  return { ok: res.ok, status: res.status, data };
}

/**
 * Paginated portal list (server pagination).
 * @param {string} path
 * @param {{ page: number; pageSize: number; reloadKey?: number }} opts
 */
export function usePortalList(path, { page, pageSize, reloadKey = 0 }) {
  const requestKey = `${path}|${page}|${pageSize}|${reloadKey}`;
  const [state, setState] = useState({
    key: "",
    items: /** @type {any[]} */ ([]),
    total: 0,
    error: "",
  });

  useEffect(() => {
    let cancelled = false;
    void portalFetch(`${path}?page=${page + 1}&pageSize=${pageSize}`).then(({ ok, data }) => {
      if (cancelled) return;
      if (!ok) {
        setState({
          key: requestKey,
          items: [],
          total: 0,
          error: typeof data.error === "string" ? data.error : "Could not load.",
        });
        return;
      }
      setState({
        key: requestKey,
        items: Array.isArray(data.items) ? data.items : [],
        total: Number(data.total) || 0,
        error: "",
      });
    });
    return () => {
      cancelled = true;
    };
  }, [path, page, pageSize, requestKey]);

  return { items: state.items, total: state.total, error: state.error, loading: state.key !== requestKey };
}

/** @param {unknown} value */
export function formatPortalDate(value) {
  if (!value) return "—";
  const d = new Date(/** @type {any} */ (value));
  return isValid(d) ? format(d, "MMM d, yyyy") : "—";
}

/** @param {unknown} value */
export function formatPortalDateTime(value) {
  if (!value) return "—";
  const d = new Date(/** @type {any} */ (value));
  return isValid(d) ? format(d, "MMM d, yyyy h:mm a") : "—";
}
