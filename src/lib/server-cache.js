import { AsyncLocalStorage } from "node:async_hooks";

/**
 * In-process read cache for slow-changing data (reference data, org setup).
 *
 * Entries declare the Prisma models they were read from. The shared Prisma client
 * (`src/lib/prisma.js`) calls `noteModelWrite` on every write, so any create / update /
 * delete — from any route or helper — clears the affected entries without per-route code.
 * Writes inside a transaction clear again after commit, so a read that raced the
 * uncommitted write cannot keep stale rows.
 *
 * One Node process = one cache. If the app is ever run as several processes, entries in
 * the other processes fall back to `ttlMs`.
 */

const MAX_ENTRIES = 5_000;
const DEFAULT_TTL_MS = 5 * 60_000;

const WRITE_OPS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);
const DELETE_OPS = new Set(["delete", "deleteMany"]);

/** @type {Map<string, { value: unknown; tags: string[]; expiresAt: number }>} */
const store = new Map();
/** @type {Map<string, Set<string>>} */
const keysByTag = new Map();
/** @type {Map<string, number>} */
const tagGeneration = new Map();
/** @type {Map<string, { promise: Promise<unknown>; before: string }>} */
const inFlight = new Map();

/** @type {AsyncLocalStorage<Set<string>>} */
const txTags = new AsyncLocalStorage();

function generationOf(tags) {
  return tags.map((t) => tagGeneration.get(t) || 0).join(",");
}

function removeKey(key) {
  const entry = store.get(key);
  if (!entry) return;
  store.delete(key);
  for (const tag of entry.tags) keysByTag.get(tag)?.delete(key);
}

/** @param {string[]} tags */
export function invalidateTags(tags) {
  for (const tag of tags) {
    tagGeneration.set(tag, (tagGeneration.get(tag) || 0) + 1);
    const keys = keysByTag.get(tag);
    if (!keys) continue;
    for (const key of [...keys]) removeKey(key);
    keysByTag.delete(tag);
  }
}

/**
 * Cached read. `models` lists every Prisma model the loader reads; add `"<Model>:delete"`
 * for parents whose deletion cascades into the data (e.g. `"Project:delete"`).
 * The result is cloned per caller so nobody can mutate the shared copy — return plain,
 * serialized data (no Prisma `Decimal` instances; they lose their prototype when cloned).
 *
 * @template T
 * @param {string} key
 * @param {string[]} models
 * @param {() => Promise<T>} load
 * @param {{ ttlMs?: number }} [opts]
 * @returns {Promise<T>}
 */
export async function cachedRead(key, models, load, { ttlMs = DEFAULT_TTL_MS } = {}) {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    store.delete(key);
    store.set(key, hit);
    return structuredClone(hit.value);
  }
  if (hit) removeKey(key);

  const before = generationOf(models);
  const joined = inFlight.get(key);
  let pending = joined?.before === before ? joined.promise : null;
  if (!pending) {
    pending = (async () => {
      try {
        const value = await load();
        if (generationOf(models) === before) {
          store.set(key, { value, tags: models, expiresAt: Date.now() + ttlMs });
          for (const tag of models) {
            if (!keysByTag.has(tag)) keysByTag.set(tag, new Set());
            keysByTag.get(tag).add(key);
          }
          while (store.size > MAX_ENTRIES) removeKey(store.keys().next().value);
        }
        return value;
      } finally {
        if (inFlight.get(key)?.promise === pending) inFlight.delete(key);
      }
    })();
    inFlight.set(key, { promise: pending, before });
  }
  return structuredClone(await pending);
}

/**
 * Called by the Prisma client extension for every model operation.
 * @param {string | undefined} model
 * @param {string} operation
 */
export function noteModelWrite(model, operation) {
  if (!model || !WRITE_OPS.has(operation)) return;
  const tags = DELETE_OPS.has(operation) ? [model, `${model}:delete`] : [model];
  invalidateTags(tags);
  const pending = txTags.getStore();
  if (pending) for (const tag of tags) pending.add(tag);
}

/**
 * Runs a Prisma `$transaction` call and re-clears every tag written inside it after commit.
 * @template T
 * @param {() => Promise<T>} run
 * @returns {Promise<T>}
 */
export async function trackTransaction(run) {
  if (txTags.getStore()) return run();
  const tags = new Set();
  try {
    return await txTags.run(tags, run);
  } finally {
    if (tags.size) invalidateTags([...tags]);
  }
}
