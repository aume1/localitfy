import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
const require = createRequire(import.meta.url);
const { generateMixes, validateDailyMixRequest, localDay } = require("../../electron/analysis/daily-mixes.cjs");
function tracks(groups, size) {
  return Array.from({ length: groups * size }, (_, index) => {
    const vector = new Float64Array(512); vector[Math.floor(index / size)] = 1;
    return { songId: `${Math.floor(index / size)}-${index}`, artist: `artist-${index % 5}`, vector };
  });
}
test("daily mixes are deterministic, coherent, disjoint, capped and spaced by artist", () => {
  const input = tracks(3, 40);
  const mixes = generateMixes(input, "today:0");
  assert.equal(mixes.length, 3);
  assert.deepEqual(mixes, generateMixes([...input].reverse(), "today:0"));
  assert.notDeepEqual(mixes, generateMixes(input, "today:1"));
  const all = mixes.flatMap((mix) => mix.songIds);
  assert.equal(new Set(all).size, 75);
  for (const mix of mixes) {
    assert.equal(mix.songIds.length, 25);
    assert.equal(new Set(mix.songIds.map((id) => id.split("-")[0])).size, 1);
    const artists = mix.songIds.map((id) => input.find((track) => track.songId === id).artist);
    for (let i = 2; i < artists.length; i++) assert.ok(!artists.slice(i - 2, i).includes(artists[i]));
  }
});
test("small or homogeneous libraries yield fewer mixes and requests are validated", () => {
  assert.deepEqual(generateMixes(tracks(1, 4), "a"), []);
  assert.equal(generateMixes(tracks(1, 5), "a")[0].songIds.length, 5);
  assert.equal(generateMixes(tracks(1, 80), "a").length, 1);
  assert.equal(generateMixes(tracks(2, 10), "a").length, 2);
  for (const input of [null, [], "bad", { refresh: 1 }]) assert.throws(() => validateDailyMixRequest(input));
  assert.deepEqual(validateDailyMixRequest(), { refresh: false });
  assert.equal(localDay(new Date(2026, 9, 16, 23, 59)), "2026-10-16");
});
test("daily mix cache survives workers, refreshes and file/profile invalidation with real SQLite", () => {
  const result = spawnSync(process.execPath, ["scripts/run-electron-node.cjs", "scripts/test-daily-mixes.cjs"], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /daily-mixes.*passed/);
});

test("saving generated tracks preserves existing playlists, removes unavailable IDs and handles name collisions", async () => {
  const source = fs.readFileSync(new URL("../../src/features/playlists/generatedPlaylist.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { prepareGeneratedPlaylist } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
  const songs = new Map([["a", { id: "a" }], ["b", { id: "b" }], ["missing", { id: "missing", fileExists: false }]]);
  const existing = [{ id: "old", name: "Mix", songIds: ["b"] }];
  assert.deepEqual(prepareGeneratedPlaylist("Mix", ["a", "a", "deleted", "missing"], songs, existing), { name: "Mix (2)", songIds: ["a"], existingId: undefined });
  assert.deepEqual(existing[0].songIds, ["b"]);
  assert.equal(prepareGeneratedPlaylist("Mix", ["b"], songs, existing).existingId, "old");
  assert.equal(prepareGeneratedPlaylist("Mix", ["missing"], songs, existing), null);
});
