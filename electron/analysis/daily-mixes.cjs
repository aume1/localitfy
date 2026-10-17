const fs = require("node:fs");
const { createHash } = require("node:crypto");
const { MODEL, ANALYZER_VERSION } = require("./model.cjs");
const { readNormalizedVector } = require("./similarity.cjs");
const GENERATOR_VERSION = 1;
function validateDailyMixRequest(payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)
    || (payload.refresh !== undefined && typeof payload.refresh !== "boolean")) throw new TypeError("Invalid mix request");
  return { refresh: payload.refresh === true };
}
function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function dot(a, b) { let sum = 0; for (let i = 0; i < a.length; i++) sum += a[i] * b[i]; return sum; }
function noise(seed, id) { return createHash("sha256").update(`${seed}:${id}`).digest().readUInt32LE(0) / 0xffffffff; }
function artist(track) { return String(track.artist || "").trim().toLowerCase(); }

// Bounded spherical clustering and sequencing. Scores describe audio similarity, not mood or probability.
function generateMixes(tracks, seed) {
  if (tracks.length < 5) return [];
  const ordered = [...tracks].sort((a, b) => a.songId.localeCompare(b.songId));
  const centers = [ordered.reduce((best, track) => noise(seed, track.songId) > noise(seed, best.songId) ? track : best).vector];
  const count = Math.min(3, Math.max(1, Math.floor(ordered.length / 10)));
  while (centers.length < count) {
    let farthest; let distance = 0.025;
    for (const track of ordered) {
      const next = 1 - Math.max(...centers.map((center) => dot(center, track.vector)));
      if (next > distance) { distance = next; farthest = track; }
    }
    if (!farthest) break;
    centers.push(farthest.vector);
  }
  let groups;
  for (let pass = 0; pass < 3; pass++) {
    groups = centers.map(() => []);
    for (const track of ordered) {
      let best = 0;
      for (let i = 1; i < centers.length; i++) if (dot(track.vector, centers[i]) > dot(track.vector, centers[best])) best = i;
      groups[best].push(track);
    }
    if (pass === 2) break;
    for (let i = 0; i < groups.length; i++) {
      if (!groups[i].length) continue;
      const mean = new Float64Array(MODEL.dimensions);
      for (const track of groups[i]) for (let j = 0; j < mean.length; j++) mean[j] += track.vector[j];
      const norm = Math.sqrt(dot(mean, mean));
      if (norm) { for (let j = 0; j < mean.length; j++) mean[j] /= norm; centers[i] = mean; }
    }
  }
  // Tiny groups join their closest viable group rather than becoming near-empty mixes.
  const viable = groups.map((group, i) => group.length >= 5 ? i : -1).filter((i) => i >= 0);
  for (let i = 0; i < groups.length; i++) if (!viable.includes(i)) {
    for (const track of groups[i]) {
      const target = viable.reduce((best, index) => dot(track.vector, centers[index]) > dot(track.vector, centers[best]) ? index : best, viable[0]);
      groups[target].push(track);
    }
  }
  return viable.map((index, mixIndex) => {
    const pool = [...groups[index]]; const selected = []; const artistCounts = new Map();
    while (pool.length && selected.length < 25) {
      const recent = selected.slice(-2).map(artist).filter(Boolean);
      const score = (track) => {
        const key = artist(track);
        const affinity = (track.liked ? .04 : 0) + Math.min(.03, Math.log1p(Math.max(0, Number(track.playCount) || 0)) * .006);
        const continuity = selected.length ? .12 * dot(track.vector, selected.at(-1).vector) : 0;
        return .65 * dot(track.vector, centers[index]) + .18 * noise(seed, track.songId) + affinity + continuity
          - (key && recent.includes(key) ? .7 : 0) - .055 * (artistCounts.get(key) || 0);
      };
      let best = 0;
      for (let i = 1; i < pool.length; i++) if (score(pool[i]) > score(pool[best])) best = i;
      const [track] = pool.splice(best, 1); selected.push(track);
      const key = artist(track); if (key) artistCounts.set(key, (artistCounts.get(key) || 0) + 1);
    }
    return { id: `daily-${mixIndex + 1}`, name: `Daily mix ${mixIndex + 1}`, songIds: selected.map((track) => track.songId) };
  });
}
async function getDailyMixes(database, request, { statFile = fs.promises.stat, now = new Date() } = {}) {
  const { refresh } = validateDailyMixRequest(request);
  const day = localDay(now);
  const records = database.prepare(`SELECT s.artist, s.liked, s.playCount, s.filePath AS currentFilePath, a.*
    FROM song_analysis a JOIN songs s ON s.id = a.songId
    WHERE a.status = 'ready' AND a.modelId = ? AND a.analyzerVersion = ? AND a.filePath = s.filePath
    ORDER BY a.songId`).all(MODEL.id, ANALYZER_VERSION);
  const identity = (rows) => JSON.stringify(rows.map((t) => [t.songId, t.filePath, t.fileSize, t.fileMtime, t.analyzedAt]));
  const originalIdentity = identity(records);
  const tracks = []; const paths = new Set();
  for (let start = 0; start < records.length; start += 32) {
    const batch = records.slice(start, start + 32);
    const valid = await Promise.all(batch.map(async (record) => {
      try { const stat = await statFile(record.filePath); return stat.isFile() && stat.size === record.fileSize && stat.mtimeMs === record.fileMtime; }
      catch { return false; }
    }));
    for (let i = 0; i < batch.length; i++) {
      const record = batch[i]; if (!valid[i] || paths.has(record.filePath)) continue;
      const vector = readNormalizedVector(record.vector); if (!vector) continue;
      tracks.push({ ...record, vector }); paths.add(record.filePath);
    }
  }
  const fingerprint = createHash("sha256").update(JSON.stringify([GENERATOR_VERSION, MODEL.id, ANALYZER_VERSION,
    tracks.map((t) => [t.songId, t.filePath, t.fileSize, t.fileMtime, t.analyzedAt])])).digest("hex");
  const cached = database.prepare("SELECT * FROM daily_mixes WHERE day = ?").get(day);
  const edition = cached ? cached.edition + 1 : 0;
  let result;
  if (!refresh && cached?.fingerprint === fingerprint) {
    try { result = JSON.parse(cached.result); } catch { /* Rebuild a damaged cache. */ }
  }
  if (!result) result = { day, edition, generatedAt: now.getTime(), eligible: tracks.length,
    mixes: generateMixes(tracks, `${day}:${edition}`) };
  // Recheck the chosen files after clustering, before committing their IDs.
  const selected = new Set(result.mixes.flatMap((mix) => mix.songIds));
  for (const track of tracks) if (selected.has(track.songId)) {
    try {
      const stat = await statFile(track.filePath);
      if (!stat.isFile() || stat.size !== track.fileSize || stat.mtimeMs !== track.fileMtime) throw new Error();
    } catch { throw new Error("A music file changed while building mixes. Please retry."); }
  }
  // Hold the write lock only for validation and a small cache write, never for clustering.
  return database.transaction(() => {
    const current = database.prepare(`SELECT a.songId, a.filePath, a.fileSize, a.fileMtime, a.analyzedAt
      FROM song_analysis a JOIN songs s ON s.id=a.songId WHERE a.status='ready'
      AND a.modelId=? AND a.analyzerVersion=? AND a.filePath=s.filePath ORDER BY a.songId`).all(MODEL.id, ANALYZER_VERSION);
    if (identity(current) !== originalIdentity) throw new Error("Library analysis changed while building mixes. Please retry.");
    const latest = database.prepare("SELECT * FROM daily_mixes WHERE day = ?").get(day);
    if (latest && latest.edition !== cached?.edition) {
      if (latest.fingerprint === fingerprint) return JSON.parse(latest.result);
      throw new Error("Library mixes changed while building. Please retry.");
    }
    database.prepare(`INSERT INTO daily_mixes (day, edition, fingerprint, result, generatedAt) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(day) DO UPDATE SET edition=excluded.edition, fingerprint=excluded.fingerprint,
      result=excluded.result, generatedAt=excluded.generatedAt`).run(day, result.edition, fingerprint, JSON.stringify(result), result.generatedAt);
    database.prepare("DELETE FROM daily_mixes WHERE day NOT IN (SELECT day FROM daily_mixes ORDER BY day DESC LIMIT 7)").run();
    return result;
  }).immediate();
}
module.exports = { generateMixes, getDailyMixes, localDay, validateDailyMixRequest };
