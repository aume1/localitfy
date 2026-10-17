const fs = require("node:fs");
const { MODEL, ANALYZER_VERSION } = require("./model.cjs");

function validateSimilarityRequest(payload) {
  if (!payload || typeof payload.songId !== "string" || !payload.songId.length || payload.songId.length > 200) {
    throw new TypeError("A song ID is required");
  }
  const limit = payload.limit ?? 30;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new TypeError("Result limit must be between 1 and 50");
  return { songId: payload.songId, limit };
}

function readNormalizedVector(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length !== MODEL.dimensions * 4) return null;
  const vector = new Float64Array(MODEL.dimensions);
  let square = 0;
  for (let i = 0; i < vector.length; i++) {
    const value = buffer.readFloatLE(i * 4);
    if (!Number.isFinite(value)) return null;
    vector[i] = value;
    square += value * value;
  }
  const norm = Math.sqrt(square);
  if (!Number.isFinite(norm) || norm <= 0) return null;
  for (let i = 0; i < vector.length; i++) vector[i] /= norm;
  return vector;
}

function compatible(record) {
  return record.status === "ready" && record.modelId === MODEL.id && record.analyzerVersion === ANALYZER_VERSION
    && record.filePath === record.currentFilePath;
}

async function fileMatches(record, statFile) {
  try {
    const stat = await statFile(record.currentFilePath);
    return stat.isFile() && stat.size === record.fileSize && stat.mtimeMs === record.fileMtime;
  } catch { return false; }
}

// Invoked in a short-lived worker: vectors and filesystem checks never cross renderer IPC.
async function findSimilarSongs(database, payload, { statFile = fs.promises.stat } = {}) {
  const { songId, limit } = validateSimilarityRequest(payload);
  const result = { seedId: songId, status: "ready", matches: [], compared: 0 };
  const seed = database.prepare(`
    SELECT s.id AS songId, s.filePath AS currentFilePath, a.* FROM songs s
    LEFT JOIN song_analysis a ON a.songId = s.id WHERE s.id = ?
  `).get(songId);
  if (!seed) return { ...result, status: "seed-unavailable" };
  try {
    if (!(await statFile(seed.currentFilePath)).isFile()) return { ...result, status: "seed-missing" };
  } catch { return { ...result, status: "seed-missing" }; }
  if (!seed.modelId || seed.status !== "ready") return { ...result, status: "seed-unanalyzed" };
  if (!compatible(seed) || !await fileMatches(seed, statFile)) return { ...result, status: "seed-stale" };
  const seedVector = readNormalizedVector(seed.vector);
  if (!seedVector) return { ...result, status: "seed-stale" };

  const candidates = database.prepare(`
    SELECT s.filePath AS currentFilePath, a.* FROM song_analysis a JOIN songs s ON s.id = a.songId
    WHERE a.songId <> ? AND a.status = 'ready' AND a.modelId = ? AND a.analyzerVersion = ?
      AND a.filePath = s.filePath AND s.filePath <> ?
  `).iterate(songId, MODEL.id, ANALYZER_VERSION, seed.currentFilePath);
  const rankBatch = async (batch) => {
    const validFiles = await Promise.all(batch.map((record) => fileMatches(record, statFile)));
    for (let index = 0; index < batch.length; index++) {
      if (!validFiles[index]) continue;
      const candidate = batch[index];
      const vector = readNormalizedVector(candidate.vector);
      if (!vector) continue;
      result.compared += 1;
      let score = 0;
      for (let i = 0; i < vector.length; i++) score += seedVector[i] * vector[i];
      // Orthogonal/opposed profiles are not useful suggestions. Scores are not probabilities.
      if (score <= 0) continue;
      result.matches.push({ songId: candidate.songId, score: Math.min(1, score) });
      result.matches.sort((a, b) => b.score - a.score || (a.songId < b.songId ? -1 : a.songId > b.songId ? 1 : 0));
      if (result.matches.length > limit) result.matches.pop();
    }
  };
  let batch = [];
  for (const candidate of candidates) {
    batch.push(candidate);
    if (batch.length === 32) { await rankBatch(batch); batch = []; }
  }
  if (batch.length) await rankBatch(batch);
  if (!await fileMatches(seed, statFile)) return { ...result, status: "seed-stale", matches: [] };
  return result;
}

module.exports = { validateSimilarityRequest, readNormalizedVector, findSimilarSongs };
