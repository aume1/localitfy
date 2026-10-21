import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import { runInNewContext } from "node:vm";

const source = fs.readFileSync("src/features/player/useSongRadio.ts", "utf8");
const app = fs.readFileSync("src/App.tsx", "utf8");
const playable = (song) => !!song && Boolean(song.filePath) && song.fileExists !== false;

function loadRadio() {
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  const modules = { react: {}, "../library/library.utils": { isPlayableSong: playable } };
  runInNewContext(compiled, { exports, require: (name) => modules[name] });
  return exports;
}

test("radio starts only when the queue has run out or playback would stop", () => {
  const { shouldStartRadio } = loadRadio();
  const base = { enabled: true, isPlaying: true, currentSongId: "a", hasQueued: false, atQueueEnd: false, continues: true, alreadyRequested: false };
  assert.equal(shouldStartRadio(base), false, "library order keeps going without radio");
  assert.equal(shouldStartRadio({ ...base, atQueueEnd: true }), true, "last song of a played mix, album or playlist");
  assert.equal(shouldStartRadio({ ...base, continues: false }), true, "a playlist or the library is about to stop");
  for (const change of [{ enabled: false }, { isPlaying: false }, { currentSongId: "" }, { hasQueued: true }, { alreadyRequested: true }]) {
    assert.equal(shouldStartRadio({ ...base, atQueueEnd: true, ...change }), false, JSON.stringify(change));
  }
});

test("radio picks unplayed, playable matches and seeds from the last distinct songs", () => {
  const { pickRadioSongs, radioSeeds } = loadRadio();
  const songs = new Map(["a", "b", "c", "d", "e", "gone"].map((id) => [id, { id, filePath: `/${id}.mp3`, fileExists: id !== "gone" }]));
  assert.deepEqual([...pickRadioSongs(["a", "gone", "b", "b", "missing", "c", "d"], new Set(["a"]), songs, 2)], ["b", "c"]);
  const byArtist = new Map([["q1", "Queen"], ["q2", "Queen feat. David Bowie"], ["q3", "queen"], ["o1", "OK Go"], ["q4", "Queen"]]
    .map(([id, artist]) => [id, { id, artist, filePath: `/${id}.mp3` }]));
  assert.deepEqual([...pickRadioSongs(["q1", "q2", "q3", "o1", "q4"], new Set(), byArtist, 3)], ["q1", "q2", "o1"], "two per artist, featured credits included");
  assert.deepEqual([...pickRadioSongs(["q1", "q2", "q3", "q4"], new Set(), byArtist, 4)], ["q1", "q2", "q3", "q4"], "fills from the cap when nothing else matches");
  assert.deepEqual([...radioSeeds(["x", "a", "b", "a", "c", "c"], 3)], ["b", "a", "c"]);
  assert.deepEqual([...radioSeeds([], 5)], []);
});

test("radio is wired into the queue and stays out of repeat and shuffle", () => {
  assert.match(app, /settings\.songRadio && settings\.experimentalMusicAnalysis && repeatMode === "off" && !repeatPlaylist && !isShuffle/);
  assert.match(app, /useSongRadio\(\{[\s\S]*setQueue: setPlayQueue/);
  assert.match(app, /radioSongIds,\s+repeatMode,/);
  assert.match(source, /Never replace something the user queued/);
});
