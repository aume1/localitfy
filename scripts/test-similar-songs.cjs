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
  function add(id, values, { analyzed = true, error, genre = "" } = {}) {
    const filePath = path.join(root, `${id}.wav`);
    fs.writeFileSync(filePath, Buffer.alloc(64));
    db.insertSongs([{ id, filePath, title: id, artist: "test", album: "fixture", genre }]);
    if (analyzed) {
      const stat = fs.statSync(filePath);
      const vector = new Float32Array(512);
      vector.set(values);
      assert.ok(db.saveSongAnalysis({ songId: id, filePath, fileSize: stat.size, fileMtime: stat.mtimeMs, vector, rms: 0.1, error }));
    }
    return filePath;
  }
  const seedFile = add("seed", [1, 0]);
  // Unrelated background tracks, as in a real library, so the library mean is a small offset rather than the seed direction.
  for (let i = 0; i < 12; i++) { const values = new Array(20 + i).fill(0); values[20 + i - 1] = 1; add(`background-${i}`, values); }
  add("exact-b", [2, 0]);
  add("exact-a", [3, 0]);
  add("near", [0.9, 0.1]);
  add("far", [0.2, 0.98]);
  add("orthogonal-near", [0.1, 0.99]);
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
      // Ranked after removing the library mean: "far" (raw cosine 0.2) and anything orthogonal drop out.
      assert.deepEqual(result.matches.map((item) => item.songId), ["exact-a", "exact-b", "near"]);
      assert.ok(Math.abs(result.matches[0].score - .8) < 1e-8, "identical sound, unknown genre");
      assert.ok(result.matches.every((item) => item.score > 0 && item.score <= 1));
      assert.equal(result.compared, 19);
      assert.equal((await service.find({ songId: "seed", limit: 2 })).matches.length, 2);
      assert.equal((await service.find({ songId: "unanalyzed" })).status, "seed-unanalyzed");
      assert.equal((await service.find({ songId: "failed" })).status, "seed-unanalyzed");
      assert.equal((await service.find({ songId: "does-not-exist" })).status, "seed-unavailable");
      assert.equal((await service.find({ songId: "missing" })).status, "seed-missing");
      for (const songId of ["changed", "retimed", "old-model", "old-analyzer", "repointed", "malformed", "nonfinite", "zero"]) {
        assert.equal((await service.find({ songId })).status, "seed-stale", songId);
      }
      // Groups (playlists, liked songs) exclude their own members and score by each candidate's closest seeds.
      const group = await service.find({ songIds: ["seed", "orthogonal", "does-not-exist"], seedKey: "playlist:p1" });
      assert.equal(group.seedId, "playlist:p1"); assert.equal(group.status, "ready"); assert.equal(group.seedCount, 2);
      assert.ok(group.matches.every((item) => !["seed", "orthogonal"].includes(item.songId)));
      assert.ok(["near", "orthogonal-near"].every((id) => group.matches.some((item) => item.songId === id)), "a group matches each of its styles");
      assert.equal((await service.find({ songIds: ["unanalyzed", "failed"], seedKey: "k" })).status, "seed-unanalyzed");
      assert.equal((await service.find({ songIds: ["nope"], seedKey: "k" })).status, "seed-unavailable");
      assert.equal((await service.find({ recent: true })).status, "no-history");
      for (const payload of [{ songIds: [], seedKey: "k" }, { songIds: ["a"] }, { songIds: "a", seedKey: "k" }, { songIds: [""], seedKey: "k" }]) {
        await assert.rejects(async () => service.find(payload));
      }

      // Back-to-back plays: only pairs heard on two or more days, where the follower was actually listened to.
      const day = 86_400_000; const now = Date.now();
      const play = inspect.prepare(`INSERT INTO play_events (id, sessionId, songId, startedAt, updatedAt, endedAt, msListened, outcome)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      let n = 0;
      const pair = (session, start, first, second, secondOutcome = "ended", secondMs = 180_000) => {
        play.run(`e${n++}`, session, first, start, start + 180_000, start + 180_000, 180_000, "ended");
        play.run(`e${n++}`, session, second, start + 181_000, start + 181_000 + secondMs, start + 181_000 + secondMs, secondMs, secondOutcome);
      };
      pair("s1", now - 3 * day, "seed", "near"); pair("s2", now - day, "near", "seed");
      pair("s1", now - 3 * day + 600_000, "seed", "exact-a");
      pair("s3", now - 3 * day, "seed", "exact-b", "replaced", 4_000); pair("s4", now - day, "seed", "exact-b", "replaced", 4_000);
      const boosted = await service.find({ songId: "seed" });
      const near = boosted.matches.find((item) => item.songId === "near");
      const before = result.matches.find((item) => item.songId === "near");
      assert.equal(near.playedTogether, true); assert.ok(near.score > before.score && near.score - before.score <= .06 + 1e-9);
      assert.equal(boosted.matches.find((item) => item.songId === "exact-a").playedTogether, undefined, "one day is not a pattern");
      assert.equal(boosted.matches.find((item) => item.songId === "exact-b").playedTogether, undefined, "skipped followers do not count");
      const recent = await service.find({ recent: true });
      assert.equal(recent.status, "ready"); assert.ok(recent.seedCount >= 3);
      assert.ok(recent.matches.every((item) => !["seed", "near", "exact-a"].includes(item.songId)));
      // Genre tags break ties between similar sounds; songs that are nearly always skipped rank lower.
      add("tagged-seed", [0, 0, 1], { genre: "Hip Hop; pop rap" });
      add("same-genre", [0, 0, 1], { genre: "hip-hop" });
      add("other-genre", [0, 0, 1], { genre: "Alternative Rock" });
      add("untagged-twin", [0, 0, 1]);
      add("skipped-twin", [0, 0, 1], { genre: "hip hop" });
      for (let i = 0; i < 6; i++) play.run(`skip${i}`, "s5", "skipped-twin", now - i * 3_600_000, now - i * 3_600_000 + 4_000, now - i * 3_600_000 + 4_000, 4_000, "replaced");
      const tagged = (await service.find({ songId: "tagged-seed" })).matches.map((item) => item.songId);
      assert.deepEqual(tagged.slice(0, 4), ["same-genre", "untagged-twin", "skipped-twin", "other-genre"], tagged.join(", "));
      // A file changed while candidates were checked must invalidate the seed result too.
      let seedChecks = 0;
      const staleDuringRead = await findSimilarSongs(inspect, { songId: "seed" }, { statFile: async (file) => {
        if (file === seedFile && ++seedChecks === 3) fs.appendFileSync(file, "changed during read");
        return fs.promises.stat(file);
      } });
      assert.equal(staleDuringRead.status, "seed-stale");
      assert.equal(staleDuringRead.matches.length, 0);
      console.log("[similar-songs] real SQLite + worker: cosine ranking, limits, identity/version checks, missing/malformed/changed files and seed states, groups, recent listening and back-to-back plays passed");
    } finally {
      service.dispose();
      inspect.close();
    }
  })().catch((error) => { console.error(error); process.exitCode = 1; });
}
