import { addDays, format, subDays } from "date-fns";
import { PROVIDER_CATEGORY } from "@/lib/projects/provider-terms";

/**
 * Simulated provider behaviours. Compliance-related behaviours shape the
 * generated documents; response/delivery behaviours drive later auto-responses
 * (quotations, bids, deliveries, invoices).
 */
export const PROVIDER_BEHAVIOUR = {
  COMPLIANT_COMPETITIVE: "COMPLIANT_COMPETITIVE",
  COMPLIANT_EXPENSIVE: "COMPLIANT_EXPENSIVE",
  NON_RESPONSIVE: "NON_RESPONSIVE",
  LATE_SUBMITTER: "LATE_SUBMITTER",
  TAX_EXPIRING: "TAX_EXPIRING",
  TAX_EXPIRED: "TAX_EXPIRED",
  MISSING_NSSF: "MISSING_NSSF",
  NOT_PPDA_REGISTERED: "NOT_PPDA_REGISTERED",
  PPDA_SUSPENDED: "PPDA_SUSPENDED",
  POOR_DELIVERY: "POOR_DELIVERY",
  INVOICE_MISMATCH: "INVOICE_MISMATCH",
};

export const PROVIDER_BEHAVIOUR_OPTIONS = [
  {
    value: PROVIDER_BEHAVIOUR.COMPLIANT_COMPETITIVE,
    label: "Compliant, competitive prices",
    compliant: true,
  },
  {
    value: PROVIDER_BEHAVIOUR.COMPLIANT_EXPENSIVE,
    label: "Compliant, high prices",
    compliant: true,
  },
  {
    value: PROVIDER_BEHAVIOUR.NON_RESPONSIVE,
    label: "Rarely responds to invitations",
    compliant: true,
  },
  {
    value: PROVIDER_BEHAVIOUR.LATE_SUBMITTER,
    label: "Often submits after the deadline",
    compliant: true,
  },
  {
    value: PROVIDER_BEHAVIOUR.TAX_EXPIRING,
    label: "Tax clearance about to expire",
    compliant: true,
  },
  {
    value: PROVIDER_BEHAVIOUR.TAX_EXPIRED,
    label: "Tax clearance expired",
    compliant: false,
  },
  {
    value: PROVIDER_BEHAVIOUR.MISSING_NSSF,
    label: "No NSSF clearance",
    compliant: false,
  },
  {
    value: PROVIDER_BEHAVIOUR.NOT_PPDA_REGISTERED,
    label: "Not on the PPDA Register of Providers",
    compliant: false,
  },
  {
    value: PROVIDER_BEHAVIOUR.PPDA_SUSPENDED,
    label: "Suspended by PPDA",
    compliant: false,
  },
  {
    value: PROVIDER_BEHAVIOUR.POOR_DELIVERY,
    label: "Delivers partially or defective items",
    compliant: true,
  },
  {
    value: PROVIDER_BEHAVIOUR.INVOICE_MISMATCH,
    label: "Invoices do not match the LPO",
    compliant: true,
  },
];

/**
 * Good-conduct traits on the provider form. Each unticked trait records its `issue`.
 */
export const PROVIDER_CONDUCT_TRAITS = [
  { issue: PROVIDER_BEHAVIOUR.NON_RESPONSIVE, label: "Responds to invitations", problem: "Rarely responds" },
  { issue: PROVIDER_BEHAVIOUR.LATE_SUBMITTER, label: "Submits before the deadline", problem: "Submits late" },
  { issue: PROVIDER_BEHAVIOUR.COMPLIANT_EXPENSIVE, label: "Quotes competitive prices", problem: "High prices" },
  { issue: PROVIDER_BEHAVIOUR.POOR_DELIVERY, label: "Delivers complete, correct items", problem: "Poor delivery" },
  { issue: PROVIDER_BEHAVIOUR.INVOICE_MISMATCH, label: "Invoices match the order", problem: "Invoices mismatch" },
];

const CONDUCT_ISSUES = new Set(PROVIDER_CONDUCT_TRAITS.map((t) => t.issue));

/**
 * @param {unknown} value
 * @returns {string[] | null} null when not an array
 */
export function normalizeConductIssues(value) {
  if (!Array.isArray(value)) return null;
  return [...new Set(value.map((v) => String(v || "").trim().toUpperCase()))].filter((v) => CONDUCT_ISSUES.has(v));
}

/**
 * Conduct problems for a provider: the stored list, or the legacy single behaviour.
 * @param {{ conductIssues?: unknown; behaviour?: string | null } | null | undefined} provider
 * @returns {Set<string>}
 */
export function providerConductIssues(provider) {
  const stored = normalizeConductIssues(provider?.conductIssues);
  if (stored) return new Set(stored);
  return new Set(provider?.behaviour && CONDUCT_ISSUES.has(provider.behaviour) ? [provider.behaviour] : []);
}

/**
 * @param {{ conductIssues?: unknown; behaviour?: string | null }} provider
 */
export function providerConductLabel(provider) {
  if (!Array.isArray(provider?.conductIssues)) return providerBehaviourLabel(provider?.behaviour);
  const issues = providerConductIssues(provider);
  if (!issues.size) return "Good conduct";
  return PROVIDER_CONDUCT_TRAITS.filter((t) => issues.has(t.issue))
    .map((t) => t.problem)
    .join(", ");
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeProviderBehaviour(value) {
  const v = String(value || "").trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(PROVIDER_BEHAVIOUR, v) ? v : null;
}

/**
 * @param {unknown} value
 */
export function providerBehaviourLabel(value) {
  return PROVIDER_BEHAVIOUR_OPTIONS.find((o) => o.value === value)?.label || "Not set";
}

export const GENERATE_MIX = {
  MIXED: "MIXED",
  COMPLIANT: "COMPLIANT",
  NON_COMPLIANT: "NON_COMPLIANT",
};

export const GENERATE_MIX_OPTIONS = [
  { value: GENERATE_MIX.MIXED, label: "Mixed (realistic market)" },
  { value: GENERATE_MIX.COMPLIANT, label: "Mostly compliant" },
  { value: GENERATE_MIX.NON_COMPLIANT, label: "Mostly non-compliant" },
];

export const MAX_GENERATE_COUNT = 20;

/** Share of a mixed batch given a problem behaviour; the rest are good providers. */
const MIXED_PROBLEM_SHARE = 0.25;
const MIXED_GOOD = [
  PROVIDER_BEHAVIOUR.COMPLIANT_COMPETITIVE,
  PROVIDER_BEHAVIOUR.COMPLIANT_COMPETITIVE,
  PROVIDER_BEHAVIOUR.COMPLIANT_COMPETITIVE,
  PROVIDER_BEHAVIOUR.COMPLIANT_EXPENSIVE,
];
const MIXED_PROBLEMS = [
  PROVIDER_BEHAVIOUR.NON_RESPONSIVE,
  PROVIDER_BEHAVIOUR.LATE_SUBMITTER,
  PROVIDER_BEHAVIOUR.TAX_EXPIRING,
  PROVIDER_BEHAVIOUR.TAX_EXPIRED,
  PROVIDER_BEHAVIOUR.MISSING_NSSF,
  PROVIDER_BEHAVIOUR.NOT_PPDA_REGISTERED,
  PROVIDER_BEHAVIOUR.PPDA_SUSPENDED,
  PROVIDER_BEHAVIOUR.POOR_DELIVERY,
  PROVIDER_BEHAVIOUR.INVOICE_MISMATCH,
];

const COMPLIANT_POOL = PROVIDER_BEHAVIOUR_OPTIONS.filter((o) => o.compliant).map((o) => o.value);
const NON_COMPLIANT_POOL = PROVIDER_BEHAVIOUR_OPTIONS.filter((o) => !o.compliant).map((o) => o.value);

/**
 * @template T
 * @param {T[]} list
 * @returns {T}
 */
function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * @param {number} min
 * @param {number} max
 */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * @param {number} len
 */
function digits(len) {
  let s = "";
  for (let i = 0; i < len; i += 1) s += String(randInt(0, 9));
  return s;
}

/**
 * @template T
 * @param {T[]} list
 */
function shuffled(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randInt(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Behaviour sequence for N generated providers. A mixed batch is mostly good
 * providers with a few distinct problem ones, shuffled.
 * @param {number} count
 * @param {string} mix
 */
export function behavioursForBatch(count, mix) {
  if (mix === GENERATE_MIX.COMPLIANT || mix === GENERATE_MIX.NON_COMPLIANT) {
    const pool = mix === GENERATE_MIX.COMPLIANT ? COMPLIANT_POOL : NON_COMPLIANT_POOL;
    const start = randInt(0, pool.length - 1);
    return Array.from({ length: count }, (_, i) => pool[(start + i) % pool.length]);
  }
  const problemCount = count < 3 ? 0 : Math.max(1, Math.round(count * MIXED_PROBLEM_SHARE));
  const problems = shuffled(MIXED_PROBLEMS);
  const batch = [
    ...Array.from({ length: problemCount }, (_, i) => problems[i % problems.length]),
    ...Array.from({ length: count - problemCount }, () => pick(MIXED_GOOD)),
  ];
  return shuffled(batch);
}

/**
 * Simulated compliance documents for a behaviour, relative to `today`.
 * @param {string | null} behaviour
 * @param {Date} [today]
 */
export function buildComplianceForBehaviour(behaviour, today = new Date()) {
  const valid = () => format(addDays(today, randInt(120, 360)), "yyyy-MM-dd");
  const year = format(today, "yyyy");
  /** @type {Record<string, { held: boolean; number: string | null; expiresAt: string | null }>} */
  const c = {
    URSB_REGISTRATION: { held: true, number: `8002${digits(9)}`, expiresAt: null },
    TIN: { held: true, number: `100${digits(7)}`, expiresAt: null },
    TAX_CLEARANCE: { held: true, number: `TCC-${year}-${digits(6)}`, expiresAt: valid() },
    NSSF_CLEARANCE: { held: true, number: `NSSF-${digits(8)}`, expiresAt: valid() },
    PPDA_REGISTRATION: { held: true, number: `PPDA/ROP/${year}/${digits(4)}`, expiresAt: valid() },
    TRADING_LICENCE: { held: true, number: `TL-${digits(6)}`, expiresAt: valid() },
    VAT_REGISTRATION: { held: Math.random() < 0.6, number: null, expiresAt: null },
  };
  if (c.VAT_REGISTRATION.held) c.VAT_REGISTRATION.number = `VAT-${digits(7)}`;

  switch (behaviour) {
    case PROVIDER_BEHAVIOUR.TAX_EXPIRING:
      c.TAX_CLEARANCE.expiresAt = format(addDays(today, randInt(5, 20)), "yyyy-MM-dd");
      break;
    case PROVIDER_BEHAVIOUR.TAX_EXPIRED:
      c.TAX_CLEARANCE.expiresAt = format(subDays(today, randInt(10, 120)), "yyyy-MM-dd");
      break;
    case PROVIDER_BEHAVIOUR.MISSING_NSSF:
      c.NSSF_CLEARANCE = { held: false, number: null, expiresAt: null };
      break;
    case PROVIDER_BEHAVIOUR.NOT_PPDA_REGISTERED:
      c.PPDA_REGISTRATION = { held: false, number: null, expiresAt: null };
      break;
    default:
      break;
  }
  return c;
}

const NAME_PLACES = [
  "Kampala", "Nile", "Pearl", "Rwenzori", "Victoria", "Kagera", "Elgon", "Kigezi",
  "Kyoga", "Albertine", "Bugisu", "Busoga", "Lango", "Ankole", "Acholi", "Sezibwa",
  "Ssese", "Muhabura", "Katonga", "Mpanga", "Murchison", "Kidepo", "Bwindi", "Mabira",
];

const NAME_TRADES = [
  { word: "Office Supplies", categories: [PROVIDER_CATEGORY.GOODS], lines: "Office stationery, toner and consumables" },
  { word: "Tech Solutions", categories: [PROVIDER_CATEGORY.GOODS, PROVIDER_CATEGORY.NON_CONSULTANCY], lines: "ICT equipment, networking and maintenance" },
  { word: "General Merchandise", categories: [PROVIDER_CATEGORY.GOODS], lines: "General supplies, cleaning materials and furniture" },
  { word: "Builders", categories: [PROVIDER_CATEGORY.WORKS], lines: "Building construction and renovations" },
  { word: "Engineering Works", categories: [PROVIDER_CATEGORY.WORKS], lines: "Civil works, roads and drainage" },
  { word: "Consult", categories: [PROVIDER_CATEGORY.CONSULTANCY], lines: "Management, audit and advisory consultancy" },
  { word: "Logistics", categories: [PROVIDER_CATEGORY.NON_CONSULTANCY], lines: "Transport, courier and clearing services" },
  { word: "Stationers", categories: [PROVIDER_CATEGORY.GOODS], lines: "Printing, stationery and branded materials" },
  { word: "Medical Supplies", categories: [PROVIDER_CATEGORY.GOODS], lines: "Medical and laboratory supplies" },
  { word: "Cleaning Services", categories: [PROVIDER_CATEGORY.NON_CONSULTANCY], lines: "Cleaning, fumigation and compound maintenance" },
  { word: "Furnishers", categories: [PROVIDER_CATEGORY.GOODS], lines: "Office and institutional furniture" },
  { word: "Hardware", categories: [PROVIDER_CATEGORY.GOODS, PROVIDER_CATEGORY.WORKS], lines: "Hardware, building materials and minor works" },
  { word: "Security Services", categories: [PROVIDER_CATEGORY.NON_CONSULTANCY], lines: "Guarding and security services" },
  { word: "Associates", categories: [PROVIDER_CATEGORY.CONSULTANCY, PROVIDER_CATEGORY.NON_CONSULTANCY], lines: "Training, research and advisory services" },
];

const NAME_SUFFIXES = ["Ltd", "(U) Ltd", "Enterprises Ltd", "& Co. Ltd", "Uganda Ltd"];
const FIRST_NAMES = [
  "Moses", "Grace", "Patrick", "Sarah", "Joseph", "Esther", "Brian", "Juliet",
  "Ivan", "Florence", "Ronald", "Agnes", "Denis", "Harriet", "Samuel", "Prossy",
];
const LAST_NAMES = [
  "Okello", "Namubiru", "Mugisha", "Atuhaire", "Ssempala", "Achieng", "Kato", "Nakato",
  "Tumusiime", "Opio", "Nansubuga", "Byaruhanga", "Wasswa", "Akello", "Mukasa", "Kiwanuka",
];
const STREETS = [
  "Kampala Road", "Jinja Road", "Entebbe Road", "Bombo Road", "Ben Kiwanuka Street",
  "Nkrumah Road", "Lumumba Avenue", "Kira Road", "Ntinda Road", "Gaba Road",
];
const TOWNS = ["Kampala", "Jinja", "Mbarara", "Gulu", "Mbale", "Arua", "Masaka", "Fort Portal"];

/**
 * @param {string} name
 */
export function providerNameSlug(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\(u\)|ltd|limited|&|co\./g, " ")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24) || "provider";
}

/**
 * Fictional provider profile (no real companies) for the generator.
 * @param {{ behaviour: string; category?: string | null; today?: Date }} opts
 */
export function buildGeneratedProviderProfile(opts) {
  const trades = opts.category
    ? NAME_TRADES.filter((t) => t.categories.includes(opts.category))
    : NAME_TRADES;
  const trade = pick(trades.length ? trades : NAME_TRADES);
  const name = `${pick(NAME_PLACES)} ${trade.word} ${pick(NAME_SUFFIXES)}`;
  const slug = providerNameSlug(name);
  const compliance = buildComplianceForBehaviour(opts.behaviour, opts.today);
  return {
    name,
    email: `info@${slug}.co.ug`,
    phone: `+256 7${randInt(0, 9)}${randInt(0, 9)} ${digits(3)} ${digits(3)}`,
    contactPerson: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    physicalAddress: `Plot ${randInt(1, 220)}, ${pick(STREETS)}, ${pick(TOWNS)}`,
    registrationRef: compliance.URSB_REGISTRATION.number,
    tin: compliance.TIN.number,
    categories: trade.categories,
    linesOfBusiness: trade.lines,
    compliance,
    ppdaSuspended: opts.behaviour === PROVIDER_BEHAVIOUR.PPDA_SUSPENDED,
    behaviour: opts.behaviour,
    conductIssues: CONDUCT_ISSUES.has(opts.behaviour) ? [opts.behaviour] : [],
  };
}
