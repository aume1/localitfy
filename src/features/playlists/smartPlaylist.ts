import type { Song } from "../library/song.types";
import { normalizeSearchText } from "../search/search.utils";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RULES = 12;
const MAX_LIMIT = 5000;

export type SmartFieldKind = "text" | "flag" | "count" | "days";
export const SMART_FIELDS = {
  genre: { label: "genre", kind: "text" },
  artist: { label: "artist", kind: "text" },
  album: { label: "album", kind: "text" },
  title: { label: "title", kind: "text" },
  liked: { label: "liked", kind: "flag" },
  plays: { label: "plays", kind: "count" },
  finishes: { label: "times finished", kind: "count" },
  skips: { label: "times skipped", kind: "count" },
  lastPlayed: { label: "last played", kind: "days" },
  added: { label: "added", kind: "days" }
} as const satisfies Record<string, { label: string; kind: SmartFieldKind }>;
export type SmartField = keyof typeof SMART_FIELDS;

export const SMART_OPS = {
  text: { contains: "contains", excludes: "doesn't contain" },
  flag: { is: "yes", isNot: "no" },
  count: { atLeast: "at least", atMost: "at most" },
  days: { within: "in the last", notWithin: "not in the last" }
} as const;
type OpsOf<K extends SmartFieldKind> = keyof (typeof SMART_OPS)[K];
export type SmartOp = OpsOf<"text"> | OpsOf<"flag"> | OpsOf<"count"> | OpsOf<"days">;

export const SMART_SORTS = {
  library: "library order",
  mostPlayed: "most played",
  leastPlayed: "least played",
  recentlyAdded: "recently added",
  recentlyPlayed: "recently played",
  random: "shuffled daily"
} as const;
export type SmartSort = keyof typeof SMART_SORTS;

/** `value` is text for text fields and a number (count or days) otherwise. */
export type SmartRule = { field: SmartField; op: SmartOp; value: string | number };
export type SmartRules = { match: "all" | "any"; rules: SmartRule[]; sort: SmartSort; limit: number | null };
export type ListeningCounts = ReadonlyMap<string, { finishes: number; skips: number }>;

export function defaultSmartRule(field: SmartField = "genre"): SmartRule {
  const kind = SMART_FIELDS[field].kind;
  return { field, op: Object.keys(SMART_OPS[kind])[0] as SmartOp, value: kind === "text" ? "" : kind === "days" ? 30 : kind === "count" ? 1 : "" };
}

export const SMART_PRESETS: { name: string; rules: SmartRules }[] = [
  { name: "Forgotten favourites", rules: { match: "all", sort: "random", limit: 50,
    rules: [{ field: "liked", op: "is", value: "" }, { field: "lastPlayed", op: "notWithin", value: 60 }] } },
  { name: "On repeat", rules: { match: "all", sort: "mostPlayed", limit: 50, rules: [{ field: "finishes", op: "atLeast", value: 3 }] } },
  { name: "Fresh imports", rules: { match: "all", sort: "recentlyAdded", limit: null, rules: [{ field: "added", op: "within", value: 30 }] } },
  { name: "Never played", rules: { match: "all", sort: "random", limit: 100, rules: [{ field: "plays", op: "atMost", value: 0 }] } }
];

function wholeNumber(value: unknown, max: number) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.min(max, Math.max(0, number)) : null;
}

/** Saved rules, or undefined if `value` is not a usable rule set. */
export function cleanSmartRules(value: unknown): SmartRules | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Partial<SmartRules>;
  if (!Array.isArray(source.rules)) return undefined;
  const rules: SmartRule[] = [];
  for (const item of source.rules.slice(0, MAX_RULES)) {
    const field = item?.field as SmartField;
    const meta = Object.hasOwn(SMART_FIELDS, field) ? SMART_FIELDS[field] : null;
    if (!meta || !Object.hasOwn(SMART_OPS[meta.kind], item.op)) continue;
    if (meta.kind === "text") {
      const text = String(item.value ?? "").trim().slice(0, 100);
      if (text) rules.push({ field, op: item.op, value: text });
    } else if (meta.kind === "flag") rules.push({ field, op: item.op, value: "" });
    else {
      const number = wholeNumber(item.value, 100_000);
      if (number !== null) rules.push({ field, op: item.op, value: number });
    }
  }
  const limit = source.limit == null ? null : wholeNumber(source.limit, MAX_LIMIT);
  return {
    match: source.match === "any" ? "any" : "all",
    rules,
    sort: Object.hasOwn(SMART_SORTS, source.sort || "") ? source.sort as SmartSort : "library",
    limit: limit ? limit : null
  };
}

function textMatches(haystack: string | undefined, needle: string) {
  const query = normalizeSearchText(needle);
  // Non-Latin text normalizes to nothing, so compare it as typed.
  return query ? normalizeSearchText(haystack).includes(query) : String(haystack || "").toLowerCase().includes(needle.toLowerCase());
}

function timeOf(value: string | null | undefined) { const time = Date.parse(value || ""); return Number.isFinite(time) ? time : null; }

function ruleMatches(song: Song, rule: SmartRule, counts: ListeningCounts, now: number) {
  const kind = SMART_FIELDS[rule.field].kind;
  if (kind === "text") {
    const found = textMatches(song[rule.field as "genre" | "artist" | "album" | "title"], String(rule.value));
    return rule.op === "contains" ? found : !found;
  }
  if (kind === "flag") return rule.op === "is" ? song.liked : !song.liked;
  const limit = Number(rule.value);
  if (kind === "count") {
    const stats = counts.get(song.id);
    const count = rule.field === "plays" ? Number(song.playCount) || 0 : rule.field === "finishes" ? stats?.finishes || 0 : stats?.skips || 0;
    return rule.op === "atLeast" ? count >= limit : count <= limit;
  }
  const time = timeOf(rule.field === "added" ? song.dateAdded : song.lastPlayed);
  const recent = time !== null && now - time <= limit * DAY_MS;
  // A song that was never played counts as "not played in the last N days".
  return rule.op === "within" ? recent : !recent;
}

function dailyShuffleKey(id: string, day: number) {
  let hash = 2166136261 ^ day;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return hash >>> 0;
}

/** Song IDs for a smart playlist, in its chosen order. Songs whose files are missing are left out. */
export function evaluateSmartRules(rules: SmartRules, songs: readonly Song[], counts: ListeningCounts = new Map(), now = Date.now()) {
  const matches = (song: Song) => rules.match === "all"
    ? rules.rules.every((rule) => ruleMatches(song, rule, counts, now))
    : !rules.rules.length || rules.rules.some((rule) => ruleMatches(song, rule, counts, now));
  const picked = songs.filter((song) => song.fileExists !== false && matches(song));
  const day = Math.floor(now / DAY_MS);
  const plays = (song: Song) => Number(song.playCount) || 0;
  const order: Record<SmartSort, ((a: Song, b: Song) => number) | null> = {
    library: null,
    mostPlayed: (a, b) => plays(b) - plays(a),
    leastPlayed: (a, b) => plays(a) - plays(b),
    recentlyAdded: (a, b) => (timeOf(b.dateAdded) || 0) - (timeOf(a.dateAdded) || 0),
    recentlyPlayed: (a, b) => (timeOf(b.lastPlayed) || 0) - (timeOf(a.lastPlayed) || 0),
    random: (a, b) => dailyShuffleKey(a.id, day) - dailyShuffleKey(b.id, day)
  };
  const compare = order[rules.sort];
  if (compare) picked.sort(compare);
  return (rules.limit ? picked.slice(0, rules.limit) : picked).map((song) => song.id);
}

/** "liked · last played not in the last 60 days · shuffled daily · up to 50" */
export function describeSmartRules(rules: SmartRules) {
  const parts = rules.rules.map((rule) => {
    const meta = SMART_FIELDS[rule.field];
    const op = (SMART_OPS[meta.kind] as Record<string, string>)[rule.op];
    if (meta.kind === "flag") return rule.op === "is" ? meta.label : `not ${meta.label}`;
    if (meta.kind === "text") return `${meta.label} ${op} "${rule.value}"`;
    return `${meta.label} ${op} ${rule.value}${meta.kind === "days" ? ` day${rule.value === 1 ? "" : "s"}` : ""}`;
  });
  const conditions = parts.length ? parts.join(rules.match === "all" ? " · " : " or ") : "every song";
  return [conditions, rules.sort === "library" ? "" : SMART_SORTS[rules.sort], rules.limit ? `up to ${rules.limit}` : ""].filter(Boolean).join(" · ");
}
