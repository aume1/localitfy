const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

// SQLite is built against Electron. Keep the fixture in a subprocess so its DB closes before cleanup on Windows.
if (!process.argv.includes("--fixture")) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "localtify-similarity-"));
  try {
    const result = spawnSync(process.execPath, [__filename, "--fixture", root], { encoding: "utf8", env: process.env });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    process.stdout.write(result.stdout);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
} else {
  const root = process.argv.at(-1);
  const databasePath = path.join(root, "library.sqlite");
  const db = require("../electron/db.cjs");
  const Database = require("better-sqlite3");
  const { createSimilarityService } = require("../electron/analysis/similarity-service.cjs");
  const { findSimilarSongs } = require("../electron/analysis/similarity.cjs");
  db.initDatabase(databasePath);
  const inspect = new Database(databasePath);
  const service = createSimilarityService({ getDatabasePath: () => databasePath });
  function add(id, values, { analyzed = true, error } = {}) {
    const filePath = path.join(root, `${id}.wav`);
    fs.writeFileSync(filePath, Buffer.alloc(64));
    db.insertSongs([{ id, filePath, title: id, artist: "test", album: "fixture" }]);
    if (analyzed) {
      const stat = fs.statSync(filePath);
      const vector = new Float32Array(512);
      vector.set(values);
      assert.ok(db.saveSongAnalysis({ songId: id, filePath, fileSize: stat.size, fileMtime: stat.mtimeMs, vector, rms: 0.1, error }));
    }
    return filePath;
  }
  const seedFile = add("seed", [1, 0]);
  add("exact-b", [2, 0]);
  add("exact-a", [3, 0]);
  add("near", [0.9, 0.1]);
  add("far", [0.2, 0.98]);
  add("opposed", [-1, 0]);
  add("orthogonal", [0, 1]);
  add("zero", [0, 0]);
  add("unanalyzed", [], { analyzed: false });
  add("failed", [], { error: "test failure" });
  add("old-model", [1, 0]);
  inspect.prepare("UPDATE song_analysis SET modelId = 'old-model' WHERE songId = 'old-model'").run();
  add("old-analyzer", [1, 0]);
  inspect.prepare("UPDATE song_analysis SET analyzerVersion = -1 WHERE songId = 'old-analyzer'").run();
  fs.unlinkSync(add("missing", [1, 0]));
  fs.appendFileSync(add("changed", [1, 0]), "file changed");
  const retimed = add("retimed", [1, 0]);
  fs.utimesSync(retimed, new Date(), new Date(Date.now() + 5000));
  add("repointed", [1, 0]);
  const replacement = path.join(root, "replacement.wav");
  fs.writeFileSync(replacement, Buffer.alloc(64));
  inspect.prepare("UPDATE songs SET filePath = ? WHERE id = 'repointed'").run(replacement);
  add("malformed", [1, 0]);
  inspect.prepare("UPDATE song_analysis SET vector = ? WHERE songId = 'malformed'").run(Buffer.alloc(4));
  add("nonfinite", [1, 0]);
  const nonfinite = Buffer.alloc(2048); nonfinite.writeFloatLE(NaN, 0);
  inspect.prepare("UPDATE song_analysis SET vector = ? WHERE songId = 'nonfinite'").run(nonfinite);

  (async () => {
    try {
      const result = await service.find({ songId: "seed" });
      assert.equal(result.status, "ready");
      assert.deepEqual(result.matches.map((item) => item.songId), ["exact-a", "exact-b", "near", "far"]);
      assert.ok(Math.abs(result.matches[0].score - 1) < 1e-8);
      assert.ok(result.matches.every((item) => item.score > 0 && item.score <= 1));
      assert.equal(result.compared, 6);
      assert.equal((await service.find({ songId: "seed", limit: 2 })).matches.length, 2);
      assert.equal((await service.find({ songId: "unanalyzed" })).status, "seed-unanalyzed");
      assert.equal((await service.find({ songId: "failed" })).status, "seed-unanalyzed");
      assert.equal((await service.find({ songId: "does-not-exist" })).status, "seed-unavailable");
      assert.equal((await service.find({ songId: "missing" })).status, "seed-missing");
      for (const songId of ["changed", "retimed", "old-model", "old-analyzer", "repointed", "malformed", "nonfinite", "zero"]) {
        assert.equal((await service.find({ songId })).status, "seed-stale", songId);
      }
      // A file changed while candidates were checked must invalidate the seed result too.
      let seedChecks = 0;
      const staleDuringRead = await findSimilarSongs(inspect, { songId: "seed" }, { statFile: async (file) => {
        if (file === seedFile && ++seedChecks === 3) fs.appendFileSync(file, "changed during read");
        return fs.promises.stat(file);
      } });
      assert.equal(staleDuringRead.status, "seed-stale");
      assert.equal(staleDuringRead.matches.length, 0);
      console.log("[similar-songs] real SQLite + worker: cosine ranking, limits, identity/version checks, missing/malformed/changed files and seed states passed");
    } finally {
      service.dispose();
      inspect.close();
    }
  })().catch((error) => { console.error(error); process.exitCode = 1; });
}
