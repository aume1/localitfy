import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const { notForMe } = require("../../electron/analysis/listening-signals.cjs");

function load(file, modules = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  runInNewContext(compiled, { exports, require: (name) => modules[name] ?? {} });
  return exports;
}
const credits = load("src/features/artists/artistCredits.ts");
const marks = load("src/features/analysis/notForMe.ts", { "../artists/artistCredits": credits });

const songs = [
  { id: "a", artist: "Hated Act" }, { id: "b", artist: "Band feat. hated  act" }, { id: "c", artist: "Friend; HATED ACT" },
  { id: "d", artist: "Hated Actor" }, { id: "e", artist: "" }, { id: "f", artist: "Someone" }, { id: "g" }
];

test("songs and every credited artist are matched the same way in the app and the background search", () => {
  const saved = { songs: ["f"], artists: ["hated act"] };
  const settings = { notForMeSongs: JSON.stringify(saved.songs), notForMeArtists: JSON.stringify(saved.artists) };
  const backend = notForMe({ prepare: () => ({ get: (key) => ({ value: settings[key] }) }) });
  const app = marks.notForMeTest(saved);
  const expected = ["a", "b", "c", "f"];
  assert.deepEqual(songs.filter(app).map((song) => song.id), expected);
  assert.deepEqual(songs.filter((song) => backend({ songId: song.id, artist: song.artist })).map((song) => song.id), expected);
});

test("marks toggle, artists ignore case, and damaged settings mean nothing is marked", () => {
  let current = marks.readNotForMe({ notForMeSongs: ["x", 4], notForMeArtists: "nope" });
  assert.deepEqual(JSON.parse(JSON.stringify(current)), { songs: ["x"], artists: [] });
  current = marks.toggleNotForMe(current, "artist", " Hated Act ");
  assert.equal(marks.hasArtistMark(current, "hated act"), true);
  assert.deepEqual([...marks.toggleNotForMe(current, "artist", "HATED ACT").artists], []);
  assert.deepEqual([...marks.toggleNotForMe(current, "song", "x").songs], []);
  assert.deepEqual([...marks.toggleNotForMe(current, "song", "y").songs], ["x", "y"]);
  const broken = notForMe({ prepare: () => ({ get: () => ({ value: "{not json" }) }) });
  assert.equal(broken({ songId: "x", artist: "Hated Act" }), false);
});

test("the song menu only offers it while music analysis is on, and radio picks leave the queue", () => {
  const app = fs.readFileSync("src/App.tsx", "utf8");
  const hook = fs.readFileSync("src/features/analysis/notForMe.ts", "utf8");
  assert.match(app, /notForMe: settings\.experimentalMusicAnalysis \? notForMe : undefined/);
  assert.match(hook, /!radioSongIds\.has\(id\) \|\| !song \|\| !marked\(song\)/);
});
