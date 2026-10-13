/** Interactive transactions doing several writes plus workflow routing. */
export const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

/**
 * Thrown inside a transaction to roll everything back and hand a `{ ok: false, ... }`
 * result to the caller (see `withTxAbort`).
 */
export class TxAbort extends Error {
  /** @param {{ ok: false; error?: string; [k: string]: unknown }} result */
  constructor(result) {
    super(result?.error || "Transaction aborted.");
    this.name = "TxAbort";
    this.result = result;
  }
}

/** True when `db` is already a transaction client (it has no `$transaction`). */
export function isTxClient(db) {
  return typeof db?.$transaction !== "function";
}

/**
 * Run `fn(tx)` atomically. Joins the caller's transaction when `db` is already one,
 * so helpers compose into a single all-or-nothing unit.
 * @template T
 * @param {any} db PrismaClient or transaction client
 * @param {(tx: any) => Promise<T>} fn
 * @param {{ maxWait?: number; timeout?: number }} [options]
 * @returns {Promise<T>}
 */
export function runInTx(db, fn, options = TX_OPTIONS) {
  return isTxClient(db) ? fn(db) : db.$transaction(fn, options);
}

/**
 * Throw `TxAbort` for a failed step result so the surrounding transaction rolls back.
 * @template T
 * @param {T} result
 * @returns {T}
 */
export function okOrAbort(result) {
  if (result && /** @type {any} */ (result).ok === false) throw new TxAbort(/** @type {any} */ (result));
  return result;
}

/**
 * Run `fn` and convert a `TxAbort` back into its `{ ok: false }` result.
 * @template T
 * @param {() => Promise<T>} fn
 */
export async function withTxAbort(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof TxAbort) return e.result;
    throw e;
  }
}
