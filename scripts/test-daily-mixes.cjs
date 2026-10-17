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
  const { createSimilarityService } = require("../electron/analysis/similarity-service.cjs");
  db.initDatabase(databasePath); const inspect = new Database(databasePath);
  let service = createSimilarityService({ getDatabasePath: () => databasePath });
  const files = [];
  for (let i = 0; i < 90; i++) {
    const id = `track-${i}`; const filePath = path.join(root, `${id}.wav`); files.push(filePath);
    fs.writeFileSync(filePath, Buffer.alloc(64)); const stat = fs.statSync(filePath);
    db.insertSongs([{ id, filePath, title: id, artist: `artist-${i % 6}`, liked: i % 2 === 0 }]);
    const vector = new Float32Array(512); vector[Math.floor(i / 30)] = 1;
    db.saveSongAnalysis({ songId: id, filePath, fileSize: stat.size, fileMtime: stat.mtimeMs, vector, rms: .1 });
  }
  (async () => {
    try {
      const first = await service.dailyMixes();
      assert.equal(first.mixes.length, 3); assert.equal(first.eligible, 90);
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
      const valid = await service.dailyMixes(); assert.equal(valid.eligible, 86);
      assert.ok(valid.mixes.flatMap((mix) => mix.songIds).every((id) => !["track-0", "track-1", "track-2", "track-3"].includes(id)));
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
      console.log("[daily-mixes] real worker, persistent cache, refresh, day rollover, invalid files and cleared analysis passed");
    } finally { service.dispose(); inspect.close(); }
  })().catch((error) => { console.error(error); process.exitCode = 1; });
}
