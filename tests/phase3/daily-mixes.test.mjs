import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
const require = createRequire(import.meta.url);
const { generateMixes, validateDailyMixRequest, localDay } = require("../../electron/analysis/daily-mixes.cjs");
const { genreTags } = require("../../electron/analysis/listening-signals.cjs");
function tracks(groups, size) {
  return Array.from({ length: groups * size }, (_, index) => {
    const vector = new Float64Array(512); vector[Math.floor(index / size)] = 1;
    return { songId: `${Math.floor(index / size)}-${index}`, artist: `artist-${index % 5}`, vector };
  });
}
test("daily mixes are deterministic, coherent, disjoint, capped and spaced by artist", () => {
  const input = tracks(3, 60);
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
function hashed(index, scale) {
  // Deterministic pseudo-random offsets so tracks within a group are similar but not identical.
  let state = (index + 1) * 2654435761 >>> 0;
  return () => { state = Math.imul(state ^ (state >>> 15), 2246822519) >>> 0; return (state / 0xffffffff - .5) * scale; };
}
function vector(axis, index, scale = .3) {
  const values = new Float64Array(512); const next = hashed(index, scale);
  values[axis] = 1; for (let i = 20; i < 60; i++) values[i] = next();
  return values;
}
test("outlier tracks cannot collapse the library into one mix; every mix is full", () => {
  const input = [];
  for (let group = 0; group < 3; group++) for (let i = 0; i < 60; i++) {
    input.push({ songId: `${group}-${i}`, artist: `artist-${group}-${i % 6}`, vector: vector(group, group * 100 + i) });
  }
  // The old farthest-point seeding turned each of these into its own 1-track group.
  for (let i = 0; i < 3; i++) input.push({ songId: `odd-${i}`, artist: "odd", vector: vector(10 + i, 900 + i, 0) });
  const mixes = generateMixes(input, "today:0");
  assert.equal(mixes.length, 3);
  for (const mix of mixes) {
    assert.equal(mix.songIds.length, 25);
    const groups = new Set(mix.songIds.filter((id) => !id.startsWith("odd")).map((id) => id.split("-")[0]));
    assert.equal(groups.size, 1, `${mix.name} mixes sound groups`);
  }
  const large = Array.from({ length: 1200 }, (_, i) => ({ songId: `t-${String(i).padStart(4, "0")}`, artist: `a-${i % 40}`, vector: vector(i % 6, i) }));
  assert.equal(generateMixes(large, "today:0").length, 5);
});
test("genre tags separate similar-sounding tracks and name the mixes", () => {
  const input = [];
  for (let i = 0; i < 90; i++) {
    const genre = i % 2 ? "Hip Hop; pop rap" : "Alternative rock";
    input.push({ songId: `s-${String(i).padStart(3, "0")}`, artist: `artist-${i % 9}`, genre, vector: vector(0, i, .2) });
  }
  const mixes = generateMixes(input, "today:0");
  assert.ok(mixes.length >= 2);
  const genreOf = new Map(input.map((track) => [track.songId, track.genre]));
  for (const mix of mixes) assert.equal(new Set(mix.songIds.map((id) => genreOf.get(id))).size, 1, mix.name);
  const names = mixes.map((mix) => mix.name);
  assert.equal(new Set(names.map((name) => name.toLowerCase())).size, names.length, "names are unique");
  assert.ok(names.includes("Hip hop mix") && names.includes("Alternative rock mix"), names.join(", "));
  assert.ok(names.every((name) => /^(Hip hop|Alternative rock) mix( · artist-\d)?$/.test(name)), names.join(", "));
  assert.deepEqual([...genreTags(" Dance-Pop ;electronic, Hip_Hop/").keys()], ["dance pop", "electronic", "hip hop"]);
  const untagged = generateMixes(tracks(1, 30).map((track) => ({ ...track, artist: "Solo" })), "a");
  assert.equal(untagged[0].name, "Solo mix");
  assert.equal(generateMixes(tracks(1, 30).map((track, i) => ({ ...track, artist: `solo-${i}` })), "a")[0].name, "Daily mix 1");
});
test("skips, finishes and recent mixes nudge selection without letting mixes converge", () => {
  const base = Array.from({ length: 40 }, (_, i) => ({ songId: `t-${String(i).padStart(2, "0")}`, artist: `artist-${i % 20}`, vector: vector(0, i, 0) }));
  const skipped = new Set(base.slice(0, 6).map((track) => track.songId));
  const withSkips = base.map((track) => skipped.has(track.songId) ? { ...track, skips: 10 } : track);
  for (const seed of ["a", "b", "c", "d"]) {
    assert.ok(generateMixes(withSkips, seed)[0].songIds.every((id) => !skipped.has(id)), "heavily skipped tracks drop out when alternatives exist");
  }
  // Everything finished often, except a few rarely played tracks: those still get exploration slots.
  const fresh = new Set(base.slice(0, 8).map((track) => track.songId));
  const played = base.map((track) => fresh.has(track.songId) ? track : { ...track, finishes: 30, playCount: 40, liked: true });
  const exploring = generateMixes(played, "a")[0].songIds.filter((id) => fresh.has(id));
  assert.ok(exploring.length >= 6, `expected at least 6 rarely played tracks, got ${exploring.length}`);
  // Tracks from recent mixes are pushed back in favour of the rest of the group.
  const first = generateMixes(base, "day-1")[0].songIds;
  const recent = new Map(first.map((id) => [id, 1]));
  const next = generateMixes(base, "day-2", { recent })[0].songIds;
  assert.ok(next.filter((id) => recent.has(id)).length <= 10, "most of yesterday's tracks rotate out");
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
