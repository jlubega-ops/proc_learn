"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearFormDraft,
  formDraftScope,
  loadFormDraft,
  saveFormDraft,
} from "@/lib/form-draft";
import { useAuthSession } from "@/components/providers/auth-session-provider";

/**
 * Fast fingerprint to skip identical server PUTs.
 * @param {unknown} value
 */
function draftFingerprint(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return "";
  }
}

/**
 * Hybrid form draft: localStorage immediately (crash/offline), server every few seconds
 * (cross-device). Tuned for exam-scale concurrency — not per keystroke.
 *
 * @param {{
 *   formKey: string;
 *   values: unknown;
 *   projectId?: string | null;
 *   enabled?: boolean;
 *   localDebounceMs?: number;
 *   serverDebounceMs?: number;
 *   onHydrated?: (payload: unknown) => void;
 * }} opts
 */
export function usePersistedFormDraft(opts) {
  const {
    formKey,
    values,
    projectId = null,
    enabled: enabledOpt = true,
    localDebounceMs = 400,
    serverDebounceMs = 5000,
    onHydrated,
  } = opts;

  const [ready, setReady] = useState(false);
  const [serverSyncState, setServerSyncState] = useState(
    /** @type {"idle" | "saving" | "saved" | "error"} */ ("idle"),
  );
  const localTimer = useRef(null);
  const serverTimer = useRef(null);
  const lastServerFp = useRef("");
  const valuesRef = useRef(values);
  const hydratedKey = useRef("");
  const onHydratedRef = useRef(onHydrated);

  useEffect(() => {
    valuesRef.current = values;
    onHydratedRef.current = onHydrated;
  });

  const { session } = useAuthSession();
  const scope = formDraftScope(session);
  const enabled = enabledOpt && Boolean(scope);
  const localKey = projectId ? `${scope}:${projectId}:${formKey}` : `${scope}:${formKey}`;

  const clearRemote = useCallback(async () => {
    clearFormDraft(localKey);
    if (!projectId || !formKey) return;
    try {
      await fetch(
        `/api/projects/${projectId}/form-drafts?formKey=${encodeURIComponent(formKey)}`,
        { method: "DELETE", credentials: "include" },
      );
    } catch {
      /* ignore */
    }
  }, [projectId, formKey, localKey]);

  const pushServer = useCallback(
    async (force = false) => {
      if (!enabled || !projectId || !formKey) return;
      const payload = valuesRef.current;
      const fp = draftFingerprint(payload);
      if (!force && fp && fp === lastServerFp.current) return;
      if (!fp || fp === "null" || fp === "{}") return;

      setServerSyncState("saving");
      try {
        const res = await fetch(`/api/projects/${projectId}/form-drafts`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ formKey, payload }),
        });
        if (!res.ok) {
          setServerSyncState("error");
          return;
        }
        lastServerFp.current = fp;
        setServerSyncState("saved");
      } catch {
        setServerSyncState("error");
      }
    },
    [enabled, projectId, formKey],
  );

  // Hydrate once per formKey: prefer server (cross-device), else localStorage.
  useEffect(() => {
    if (!enabled || !formKey) return;
    if (hydratedKey.current === formKey) return;
    let cancelled = false;
    hydratedKey.current = formKey;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating from server/localStorage
    setReady(false);

    (async () => {
      /** @type {unknown} */
      let payload = null;
      if (projectId) {
        try {
          const res = await fetch(
            `/api/projects/${projectId}/form-drafts?formKey=${encodeURIComponent(formKey)}`,
            { credentials: "include" },
          );
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.draft?.payload != null) {
            payload = data.draft.payload;
            lastServerFp.current = draftFingerprint(payload);
          }
        } catch {
          /* fall through to local */
        }
      }
      if (payload == null) {
        payload = loadFormDraft(localKey);
      }
      if (!cancelled && payload != null && onHydratedRef.current) {
        onHydratedRef.current(payload);
      }
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, formKey, projectId, localKey]);

  // Local debounce
  useEffect(() => {
    if (!enabled || !ready) return;
    if (localTimer.current) window.clearTimeout(localTimer.current);
    localTimer.current = window.setTimeout(() => {
      saveFormDraft(localKey, valuesRef.current);
    }, localDebounceMs);
    return () => {
      if (localTimer.current) window.clearTimeout(localTimer.current);
    };
  }, [enabled, ready, localKey, localDebounceMs, values]);

  // Server debounce (longer)
  useEffect(() => {
    if (!enabled || !ready || !projectId) return;
    if (serverTimer.current) window.clearTimeout(serverTimer.current);
    serverTimer.current = window.setTimeout(() => {
      void pushServer(false);
    }, serverDebounceMs);
    return () => {
      if (serverTimer.current) window.clearTimeout(serverTimer.current);
    };
  }, [enabled, ready, projectId, serverDebounceMs, values, pushServer]);

  // Flush on hide / unload
  useEffect(() => {
    if (!enabled || !ready) return;
    const flush = () => {
      saveFormDraft(localKey, valuesRef.current);
      void pushServer(true);
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, ready, localKey, pushServer]);

  return {
    ready,
    serverSyncState,
    clearDraft: clearRemote,
    persistNow: () => {
      saveFormDraft(localKey, valuesRef.current);
      void pushServer(true);
    },
  };
}

/** @deprecated Prefer usePersistedFormDraft for org/create forms. */
export { useFormDraft } from "@/hooks/use-form-draft";
