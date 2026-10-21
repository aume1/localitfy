const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
if (!process.argv.includes("--fixture")) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "localtify-daily-mixes-"));
  try {
    const result = spawnSync(process.execPath, [__filename, "--fixture", root], { encoding: "utf8", env: process.env });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    process.stdout.write(result.stdout);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
} else {
  const root = process.argv.at(-1); const databasePath = path.join(root, "library.sqlite");
  const db = require("../electron/db.cjs");
  const Database = require("better-sqlite3");
  const { getDailyMixes } = require("../electron/analysis/daily-mixes.cjs");
  const { listeningStats } = require("../electron/analysis/listening-signals.cjs");
  const { createSimilarityService } = require("../electron/analysis/similarity-service.cjs");
  db.initDatabase(databasePath); const inspect = new Database(databasePath);
  let service = createSimilarityService({ getDatabasePath: () => databasePath });
  const files = [];
  for (let i = 0; i < 150; i++) {
    const id = `track-${i}`; const filePath = path.join(root, `${id}.wav`); files.push(filePath);
    fs.writeFileSync(filePath, Buffer.alloc(64)); const stat = fs.statSync(filePath);
    db.insertSongs([{ id, filePath, title: id, artist: `artist-${i % 6}`, liked: i % 2 === 0 }]);
    const vector = new Float32Array(512); vector[Math.floor(i / 50)] = 1;
    db.saveSongAnalysis({ songId: id, filePath, fileSize: stat.size, fileMtime: stat.mtimeMs, vector, rms: .1 });
  }
  (async () => {
    try {
      const first = await service.dailyMixes();
      assert.equal(first.mixes.length, 3); assert.equal(first.eligible, 150);
      service.dispose(); service = createSimilarityService({ getDatabasePath: () => databasePath });
      assert.deepEqual(await service.dailyMixes(), first);
      inspect.prepare("UPDATE songs SET liked=1, playCount=50").run();
      assert.deepEqual(await service.dailyMixes(), first, "affinity changes must not churn today's cache");
      const saved = { id: "saved-mix", name: "Saved daily mix", songIds: first.mixes[0].songIds, createdAt: Date.now() };
      db.savePlaylists([saved]);
      assert.deepEqual(db.getPlaylists()[0].songIds, saved.songIds);
      const refresh = await service.dailyMixes({ refresh: true });
      assert.equal(refresh.edition, first.edition + 1); assert.notDeepEqual(refresh.mixes, first.mixes);
      assert.deepEqual(await service.dailyMixes(), refresh);
      fs.unlinkSync(files[0]); fs.appendFileSync(files[1], "change");
      inspect.prepare("UPDATE song_analysis SET modelId='old' WHERE songId='track-2'").run();
      inspect.prepare("UPDATE song_analysis SET vector=? WHERE songId='track-3'").run(Buffer.alloc(4));
      const valid = await service.dailyMixes(); assert.equal(valid.eligible, 146);
      assert.equal(valid.edition, refresh.edition, "background invalidation must not advance the daily edition");
      assert.ok(valid.mixes.flatMap((mix) => mix.songIds).every((id) => !["track-0", "track-1", "track-2", "track-3"].includes(id)));
      const now = new Date(2030, 0, 2, 12); const at = now.getTime() - 60_000;
      inspect.prepare("UPDATE songs SET durationMs = 200000 WHERE id IN ('track-10', 'track-11', 'track-12')").run();
      const event = inspect.prepare(`INSERT INTO play_events (id, sessionId, songId, startedAt, updatedAt, endedAt, msListened, outcome)
        VALUES (?, 's', ?, ?, ?, ?, ?, ?)`);
      event.run("e1", "track-10", at, at + 200_000, at + 200_000, 200_000, "ended");
      event.run("e2", "track-10", at, at + 170_000, at + 170_000, 170_000, "replaced");
      event.run("e3", "track-11", at, at + 5_000, at + 5_000, 5_000, "replaced");
      event.run("e4", "track-12", at, at + 5_000, at + 5_000, 5_000, "interrupted");
      event.run("e5", "track-12", at - 100 * 86_400_000, at, at, 5_000, "replaced");
      const stats = listeningStats(inspect, now);
      assert.equal(Math.round(stats.get("track-10").finishes * 100), 200, "ended and 80%+ plays both count as finished");
      assert.equal(stats.get("track-11").skips > .99 && stats.get("track-11").finishes, 0);
      assert.equal(stats.has("track-12"), false, "interrupted and >90-day-old events are ignored");
      const tomorrow = await getDailyMixes(inspect, {}, { now: new Date(2030, 0, 2) });
      assert.equal(tomorrow.day, "2030-01-02"); assert.equal(tomorrow.edition, 0);
      const checks = new Map();
      await assert.rejects(() => getDailyMixes(inspect, { refresh: true }, { statFile: async (file) => {
        checks.set(file, (checks.get(file) || 0) + 1);
        if (checks.get(file) === 2) fs.appendFileSync(file, "changed during generation");
        return fs.promises.stat(file);
      } }), /file changed/);
      assert.equal(inspect.prepare("SELECT COUNT(*) AS count FROM daily_mixes").get().count, 2);
      assert.deepEqual(db.getPlaylists()[0].songIds, saved.songIds, "refreshing mixes must preserve saved playlists");
      db.clearSongAnalysis();
      assert.equal(inspect.prepare("SELECT COUNT(*) AS count FROM daily_mixes").get().count, 0);
      assert.deepEqual(db.getPlaylists()[0].songIds, saved.songIds, "clearing profiles must preserve saved playlists");
      const empty = await service.dailyMixes(); assert.equal(empty.eligible, 0); assert.deepEqual(empty.mixes, []);
      console.log("[daily-mixes] real worker, persistent cache, refresh, day rollover, listening stats, invalid files and cleared analysis passed");
    } finally { service.dispose(); inspect.close(); }
  })().catch((error) => { console.error(error); process.exitCode = 1; });
}
