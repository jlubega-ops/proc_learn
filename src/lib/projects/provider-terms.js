/**
 * PPDA terminology for providers. "Provider" is the general term; the specific
 * term follows the nature of the procurement (goods → supplier, works →
 * contractor, non-consultancy services → service provider, consultancy →
 * consultant).
 */

export const PROVIDER_CATEGORY = {
  GOODS: "GOODS",
  WORKS: "WORKS",
  NON_CONSULTANCY: "NON_CONSULTANCY",
  CONSULTANCY: "CONSULTANCY",
};

export const PROVIDER_CATEGORY_OPTIONS = [
  { value: PROVIDER_CATEGORY.GOODS, label: "Goods" },
  { value: PROVIDER_CATEGORY.WORKS, label: "Works" },
  { value: PROVIDER_CATEGORY.NON_CONSULTANCY, label: "Non-consultancy services" },
  { value: PROVIDER_CATEGORY.CONSULTANCY, label: "Consultancy services" },
];

const TERMS = {
  [PROVIDER_CATEGORY.GOODS]: { singular: "supplier", plural: "suppliers" },
  [PROVIDER_CATEGORY.WORKS]: { singular: "contractor", plural: "contractors" },
  [PROVIDER_CATEGORY.NON_CONSULTANCY]: {
    singular: "service provider",
    plural: "service providers",
  },
  [PROVIDER_CATEGORY.CONSULTANCY]: { singular: "consultant", plural: "consultants" },
};

const GENERAL = { singular: "provider", plural: "providers" };

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeProviderCategory(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const upper = raw.toUpperCase().replace(/[\s-]+/g, "_");
  if (Object.prototype.hasOwnProperty.call(PROVIDER_CATEGORY, upper)) return upper;
  const lower = raw.toLowerCase();
  if (/consult/.test(lower) && !/non[\s_-]*consult/.test(lower)) {
    return PROVIDER_CATEGORY.CONSULTANCY;
  }
  if (/\bworks?\b|construct|civil|renovat|building/.test(lower)) return PROVIDER_CATEGORY.WORKS;
  if (/service/.test(lower)) return PROVIDER_CATEGORY.NON_CONSULTANCY;
  if (/goods|suppl|equipment|stationer|furniture|ict|computer/.test(lower)) {
    return PROVIDER_CATEGORY.GOODS;
  }
  return null;
}

/**
 * @param {unknown} category
 * @param {{ plural?: boolean; capitalize?: boolean }} [opts]
 */
export function providerTerm(category, opts = {}) {
  const key = normalizeProviderCategory(category);
  const t = (key && TERMS[key]) || GENERAL;
  const word = opts.plural ? t.plural : t.singular;
  return opts.capitalize ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeProviderCategories(value) {
  const list = Array.isArray(value) ? value : [];
  const out = [];
  for (const v of list) {
    const key = normalizeProviderCategory(v);
    if (key && !out.includes(key)) out.push(key);
  }
  return out;
}

/**
 * @param {unknown} key
 */
export function providerCategoryLabel(key) {
  return PROVIDER_CATEGORY_OPTIONS.find((o) => o.value === key)?.label || String(key || "");
}
