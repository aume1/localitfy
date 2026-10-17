const { MODEL, ANALYZER_VERSION } = require("../analysis/model.cjs");

function createSongAnalysisTable(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS song_analysis (
      songId TEXT PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
      analyzerVersion INTEGER NOT NULL,
      modelId TEXT NOT NULL,
      filePath TEXT NOT NULL,
      fileSize INTEGER NOT NULL,
      fileMtime REAL NOT NULL,
      status TEXT NOT NULL,
      analyzedAt INTEGER NOT NULL,
      rms REAL,
      vector BLOB,
      error TEXT NOT NULL DEFAULT ''
    );
  `);
}
function getSongAnalysis(database) {
  return database.prepare("SELECT songId, analyzerVersion, modelId, filePath, fileSize, fileMtime, status, analyzedAt, rms, error FROM song_analysis").all();
}
function saveSongAnalysis(database, record) {
  if (database.prepare("SELECT filePath FROM songs WHERE id = ?").get(record.songId)?.filePath !== record.filePath) return false;
  const valid = !record.error && record.vector instanceof Float32Array && record.vector.length === MODEL.dimensions
    && record.vector.every(Number.isFinite) && Number.isFinite(record.rms);
  if (!record.error && !valid) return false;
  database.prepare(`
    INSERT INTO song_analysis (songId, analyzerVersion, modelId, filePath, fileSize, fileMtime, status, analyzedAt, rms, vector, error)
    VALUES (@songId, @analyzerVersion, @modelId, @filePath, @fileSize, @fileMtime, @status, @analyzedAt, @rms, @vector, @error)
    ON CONFLICT(songId) DO UPDATE SET analyzerVersion = excluded.analyzerVersion, modelId = excluded.modelId,
      filePath = excluded.filePath, fileSize = excluded.fileSize, fileMtime = excluded.fileMtime, status = excluded.status,
      analyzedAt = excluded.analyzedAt, rms = excluded.rms, vector = excluded.vector, error = excluded.error
  `).run({ songId: record.songId, analyzerVersion: ANALYZER_VERSION, modelId: MODEL.id,
    filePath: record.filePath, fileSize: record.fileSize, fileMtime: record.fileMtime, status: valid ? "ready" : "failed", analyzedAt: Date.now(),
    rms: valid ? record.rms : null, vector: valid ? Buffer.from(record.vector.buffer, record.vector.byteOffset, record.vector.byteLength) : null,
    error: String(record.error || "").slice(0, 500) });
  return true;
}
module.exports = { createSongAnalysisTable, getSongAnalysis, saveSongAnalysis };
