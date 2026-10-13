"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
 * Autosave for forms whose fields live in separate `useState`s. Pass a snapshot object of the
 * fields and an `onRestore(draft)` that sets them back. Local only, debounced, flushed when
 * the tab hides; survives refresh, crash, power loss and browser restart.
 *
 * Only writes once the snapshot differs from the one seen at (re)hydration, so untouched
 * forms are never stored.
 *
 * @param {string} formKey stable per form + record
 * @param {Record<string, unknown>} snapshot current field values (JSON-serializable)
 * @param {(draft: Record<string, unknown>) => void} onRestore
 * @param {{ enabled?: boolean; debounceMs?: number; resetKey?: unknown; scope?: string | null }} [options]
 *   `enabled` false while a dialog is closed; `resetKey` changes per record / open;
 *   `scope` overrides the signed-in identity (e.g. `provider:<id>` in the supplier portal).
 */
export function useDraftSync(formKey, snapshot, onRestore, options = {}) {
  const { enabled = true, debounceMs = 600, resetKey, scope: scopeOverride } = options;
  const { session } = useAuthSession();
  const scope = scopeOverride || formDraftScope(session);
  const storageKey = enabled && scope && formKey ? `${scope}:${formKey}` : null;
  const current = fingerprint(snapshot);

  const [restored, setRestored] = useState(false);
  const [baseline, setBaseline] = useState(/** @type {string | null} */ (null));
  const snapRef = useRef(snapshot);
  const currentRef = useRef(current);
  const baselineRef = useRef(/** @type {string | null} */ (null));
  const restoreRef = useRef(onRestore);
  const hydratedFor = useRef(/** @type {string | null} */ (null));
  const rebaseNext = useRef(false);
  const timer = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));

  useEffect(() => {
    snapRef.current = snapshot;
    currentRef.current = current;
    restoreRef.current = onRestore;
  });

  const rebase = useCallback((/** @type {string | null} */ fp) => {
    baselineRef.current = fp;
    setBaseline(fp);
  }, []);

  useEffect(() => {
    const marker = storageKey ? `${storageKey}|${String(resetKey ?? "")}` : null;
    if (!marker) {
      hydratedFor.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with localStorage
      rebase(null);
      setRestored(false);
      return;
    }
    if (hydratedFor.current === marker) return;
    hydratedFor.current = marker;
    rebase(currentRef.current);
    const draft = loadFormDraft(storageKey);
    if (draft && typeof draft === "object" && !Array.isArray(draft)) {
      restoreRef.current(/** @type {Record<string, unknown>} */ (draft));
      setRestored(true);
    } else {
      setRestored(false);
    }
  }, [storageKey, resetKey, rebase]);

  const writeNow = useCallback(() => {
    if (!storageKey || baselineRef.current == null) return;
    const fp = currentRef.current;
    if (rebaseNext.current) {
      rebaseNext.current = false;
      rebase(fp);
      return;
    }
    if (fp === baselineRef.current) {
      clearFormDraft(storageKey);
      return;
    }
    saveFormDraft(storageKey, snapRef.current);
  }, [storageKey, rebase]);

  useEffect(() => {
    if (!storageKey) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(writeNow, debounceMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [current, storageKey, debounceMs, writeNow]);

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

  /** Remove the stored draft (after a successful save or a confirmed cancel). */
  const clearDraft = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (storageKey) clearFormDraft(storageKey);
    rebaseNext.current = true;
    timer.current = setTimeout(writeNow, debounceMs);
    setRestored(false);
  }, [storageKey, writeNow, debounceMs]);

  const isDirty = restored || (baseline != null && current !== baseline);
  return { restored, isDirty, clearDraft };
}
