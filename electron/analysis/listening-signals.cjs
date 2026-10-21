// Signals shared by daily mixes, similar songs and song radio: genre tags, library-centered audio
// profiles, and what listening history says about each song.
const DAY_MS = 24 * 60 * 60 * 1000;
const AUDIO_WEIGHT = .6;
const GENRE_WEIGHT = .4;
const HISTORY_DAYS = 90;
const HISTORY_HALF_LIFE_DAYS = 21;

function dot(a, b) { let sum = 0; for (let i = 0; i < a.length; i++) sum += a[i] * b[i]; return sum; }
function normalize(vector) {
  const norm = Math.sqrt(dot(vector, vector));
  if (norm > 1e-9) for (let i = 0; i < vector.length; i++) vector[i] /= norm;
  else vector.fill(0);
  return vector;
}

function genreKey(text) { return String(text).toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim(); }
// "dance-pop; electronic" -> tags {dance pop, electronic}; words of multi-word tags link related genres.
function genreTags(value) {
  const tags = new Map();
  for (const part of String(value || "").split(/[;,/|]/)) {
    const key = genreKey(part);
    if (key && key.length <= 60 && !tags.has(key)) tags.set(key, part.trim());
  }
  return tags;
}
function genreTokens(tags) {
  const tokens = new Map();
  for (const key of tags.keys()) {
    tokens.set(key, 1);
    const words = key.split(" ");
    if (words.length > 1) for (const word of words) if (word.length > 1 && !tokens.has(word)) tokens.set(word, .5);
  }
  return tokens;
}
/** Cosine similarity of two genre token maps; null when either song is untagged. */
function genreSimilarity(a, b) {
  if (!a.size || !b.size) return null;
  let shared = 0; let normA = 0; let normB = 0;
  for (const [token, weight] of a) { normA += weight * weight; const other = b.get(token); if (other) shared += weight * other; }
  for (const weight of b.values()) normB += weight * weight;
  return shared / Math.sqrt(normA * normB);
}

// Audio profiles share a narrow cone (median cosine ~0.7), so compare them after removing the library mean.
function libraryMean(vectors) {
  const mean = new Float64Array(vectors[0]?.length || 0);
  for (const vector of vectors) for (let i = 0; i < mean.length; i++) mean[i] += vector[i] / vectors.length;
  return mean;
}
function centered(vector, mean) {
  const result = new Float64Array(vector.length);
  for (let i = 0; i < vector.length; i++) result[i] = vector[i] - mean[i];
  return normalize(result);
}

/** Finished (ended, crossfaded, or 80%+ heard), skipped (replaced before min(30 s, half)), and heard (not a quick skip). */
function classifyPlay(row) {
  const duration = Number(row.durationMs) || (Number(row.duration) || 0) * 1000;
  const early = duration > 0 ? Math.min(30_000, duration * .5) : 30_000;
  const finished = row.outcome === "ended" || row.outcome === "transition" || (duration > 0 && row.msListened >= duration * .8);
  const skipped = !finished && row.outcome === "replaced" && row.msListened < early;
  return { finished, skipped, heard: finished || row.msListened >= early };
}

// Decayed per-song listening outcomes. Finished plays count for a song; leaving early counts against it.
function listeningStats(database, now = Date.now()) {
  const time = now instanceof Date ? now.getTime() : now; const stats = new Map();
  const rows = database.prepare(`SELECT e.songId, e.startedAt, e.msListened, e.outcome, s.durationMs, s.duration
    FROM play_events e JOIN songs s ON s.id = e.songId WHERE e.startedAt >= ? AND e.outcome <> 'active'`).iterate(time - HISTORY_DAYS * DAY_MS);
  for (const row of rows) {
    const { finished, skipped } = classifyPlay(row);
    if (!finished && !skipped) continue;
    const weight = Math.pow(.5, Math.max(0, time - row.startedAt) / (HISTORY_HALF_LIFE_DAYS * DAY_MS));
    const entry = stats.get(row.songId) || { finishes: 0, skips: 0 };
    if (finished) entry.finishes += weight; else entry.skips += weight;
    stats.set(row.songId, entry);
  }
  return stats;
}
/** 0 with no evidence, approaching 1 for songs that are nearly always skipped. */
function skipRate(stats) {
  const finishes = stats?.finishes || 0; const skips = stats?.skips || 0;
  return skips ? skips / (skips + finishes + 1) : 0;
}

module.exports = { DAY_MS, AUDIO_WEIGHT, GENRE_WEIGHT, dot, normalize, genreKey, genreTags, genreTokens, genreSimilarity,
  libraryMean, centered, classifyPlay, listeningStats, skipRate };
