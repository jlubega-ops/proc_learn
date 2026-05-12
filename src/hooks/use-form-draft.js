"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearFormDraft,
  loadFormDraft,
  saveFormDraft,
} from "@/lib/form-draft";

/**
 * Keeps form state in localStorage with debounced writes (low overhead, survives refresh/offline).
 * @param {string} formKey
 * @param {unknown} values
 * @param {{ debounceMs?: number }} [options]
 */
export function useFormDraft(formKey, values, options = {}) {
  const debounceMs = options.debounceMs ?? 500;
  const [hydrated, setHydrated] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const persist = useCallback(() => {
    saveFormDraft(formKey, values);
  }, [formKey, values]);

  useEffect(() => {
    if (!hydrated) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(persist, debounceMs);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [hydrated, persist, debounceMs, values]);

  const load = useCallback(() => loadFormDraft(formKey), [formKey]);
  const clear = useCallback(() => clearFormDraft(formKey), [formKey]);

  useEffect(() => {
    const onHide = () => persist();
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [persist]);

  return { load, clear, persistNow: persist };
}
