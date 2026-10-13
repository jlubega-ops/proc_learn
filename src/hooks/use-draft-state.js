"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthSession } from "@/components/providers/auth-session-provider";
import { clearFormDraft, formDraftScope, loadFormDraft, saveFormDraft } from "@/lib/form-draft";

/** @param {unknown} v */
function fingerprint(v) {
  try {
    return JSON.stringify(v ?? null);
  } catch {
    return "";
  }
}

/**
 * @template T
 * @param {T} value
 * @param {string[]} omit
 * @returns {T}
 */
function withoutKeys(value, omit) {
  if (!omit.length || !value || typeof value !== "object" || Array.isArray(value)) return value;
  const copy = /** @type {any} */ ({ ...value });
  for (const k of omit) delete copy[k];
  return copy;
}

/**
 * Drop-in `useState` for form values that autosaves to this browser (debounced, flushed when
 * the tab hides) and restores after refresh, crash, power loss or browser restart.
 * Local only — no server traffic. Untouched forms are never written.
 *
 * @template T
 * @param {string} formKey stable per form + record, e.g. `requisition:edit:${id}`
 * @param {T} initialValue
 * @param {{
 *   enabled?: boolean;
 *   debounceMs?: number;
 *   omitKeys?: string[];   // never persisted (passwords, files)
 *   resetKey?: unknown;    // when this changes (e.g. dialog reopened for another record) re-hydrate
 *   scope?: string | null; // overrides the signed-in identity (supplier portal: `provider:<id>`)
 * }} [options]
 * @returns {[T, import("react").Dispatch<import("react").SetStateAction<T>>, {
 *   isDirty: boolean;
 *   restored: boolean;
 *   clearDraft: () => void;
 *   resetForm: (next?: T) => void;
 * }]}
 */
export function useDraftState(formKey, initialValue, options = {}) {
  const { enabled = true, debounceMs = 600, omitKeys, resetKey, scope: scopeOverride } = options;
  const { session } = useAuthSession();
  const scope = scopeOverride || formDraftScope(session);
  const storageKey = enabled && scope && formKey ? `${scope}:${formKey}` : null;

  const [value, setValue] = useState(initialValue);
  const [restored, setRestored] = useState(false);
  const initialRef = useRef(initialValue);
  const valueRef = useRef(value);
  const timer = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));
  const hydratedFor = useRef(/** @type {string | null} */ (null));
  const omit = useMemo(() => omitKeys || [], [omitKeys]);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const [baseline, setBaseline] = useState(() => fingerprint(withoutKeys(initialValue, omitKeys || [])));
  const current = useMemo(() => fingerprint(withoutKeys(value, omit)), [value, omit]);
  const isDirty = current !== baseline;
  const firstReset = useRef(true);

  // Re-baseline when the caller resets for a different record.
  useEffect(() => {
    if (firstReset.current) {
      firstReset.current = false;
      return;
    }
    initialRef.current = initialValue;
    hydratedFor.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset driven by caller's resetKey
    setValue(initialValue);
    setBaseline(fingerprint(withoutKeys(initialValue, omit)));
    setRestored(false);
  }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hydrate once per storage key.
  useEffect(() => {
    if (!storageKey || hydratedFor.current === `${storageKey}|${String(resetKey ?? "")}`) return;
    hydratedFor.current = `${storageKey}|${String(resetKey ?? "")}`;
    const draft = loadFormDraft(storageKey);
    if (draft == null) return;
    const base = initialRef.current;
    const next =
      base && typeof base === "object" && !Array.isArray(base) && typeof draft === "object" && !Array.isArray(draft)
        ? { ...base, ...draft }
        : draft;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating from localStorage
    setValue(/** @type {T} */ (next));
    setRestored(true);
  }, [storageKey, resetKey]);

  const writeNow = useCallback(() => {
    if (!storageKey) return;
    const snapshot = withoutKeys(valueRef.current, omit);
    if (fingerprint(snapshot) === fingerprint(withoutKeys(initialRef.current, omit))) {
      clearFormDraft(storageKey);
    } else {
      saveFormDraft(storageKey, snapshot);
    }
  }, [storageKey, omit]);

  // Debounced write on change.
  useEffect(() => {
    if (!storageKey || hydratedFor.current == null) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(writeNow, debounceMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [current, storageKey, debounceMs, writeNow]);

  // Flush when the tab hides or the page unloads (power-off safety).
  useEffect(() => {
    if (!storageKey) return;
    const onHide = () => {
      if (document.visibilityState === "hidden") writeNow();
    };
    window.addEventListener("pagehide", writeNow);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", writeNow);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [storageKey, writeNow]);

  const clearDraft = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (storageKey) clearFormDraft(storageKey);
    setRestored(false);
  }, [storageKey]);

  const resetForm = useCallback(
    (/** @type {T | undefined} */ next) => {
      if (timer.current) clearTimeout(timer.current);
      if (storageKey) clearFormDraft(storageKey);
      const base = next === undefined ? initialRef.current : next;
      initialRef.current = base;
      valueRef.current = base;
      setValue(base);
      setBaseline(fingerprint(withoutKeys(base, omit)));
      setRestored(false);
    },
    [storageKey, omit],
  );

  return [value, setValue, { isDirty, restored, clearDraft, resetForm }];
}
