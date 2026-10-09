/**
 * PPDA method ceilings (UGX, supplies / non-consultancy services) used by the simulator.
 * A more competitive method may always be used below a ceiling; a method may not be used above it.
 */
export const METHOD_VALUE_CEILINGS_UGX = {
  MICRO: 10_000_000,
};

/** Providers an RFQ must go to; fewer only with a recorded justification. */
export const MIN_RFQ_PROVIDERS = 3;

/**
 * @param {string | null | undefined} method
 * @param {unknown} estimatedValue
 * @returns {{ ok: true } | { ok: false; error: string; ceiling: number }}
 */
export function checkMethodValueCeiling(method, estimatedValue) {
  const key = String(method || "").toUpperCase();
  const ceiling = METHOD_VALUE_CEILINGS_UGX[key];
  const value = Number(estimatedValue ?? 0);
  if (!ceiling || !Number.isFinite(value) || value <= ceiling) return { ok: true };
  return {
    ok: false,
    ceiling,
    error: `${key} procurement is limited to UGX ${ceiling.toLocaleString("en-US")}. This requisition is UGX ${value.toLocaleString("en-US")} — recommend QUOTATION or TENDER instead.`,
  };
}
