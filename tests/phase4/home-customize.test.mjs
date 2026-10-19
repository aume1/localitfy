import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import { runInNewContext } from "node:vm";

const read = (relative) => fs.readFileSync(relative, "utf8");

function loadCommonJs(relative) {
  const { outputText } = ts.transpileModule(read(relative), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  const module = { exports: {} };
  runInNewContext(outputText, { module, exports: module.exports });
  return module.exports;
}

const layout = loadCommonJs("src/features/home/homeLayout.ts");
const plain = (value) => JSON.parse(JSON.stringify(value));
const defaults = ["jumpBack", "listenNow", "dailyMixes", "recentlyPlayed", "mostListened", "newAlbums", "newReleases", "likedSongs", "rediscover", "notPlayedYet"];
const defaultHidden = ["likedSongs", "rediscover", "notPlayedYet"];
const defaultVisible = defaults.filter((id) => !defaultHidden.includes(id));

test("Home shows the default sections in order until customized", () => {
  assert.deepEqual(plain(layout.defaultHiddenHomeSections), defaultHidden);
  assert.deepEqual(plain(layout.visibleHomeSections([], defaultHidden)), defaultVisible);
  assert.deepEqual(plain(layout.visibleHomeSections(undefined, [])), defaults);
  assert.equal(layout.isHomeLayoutCustomized([], defaultHidden), false);
  assert.equal(layout.isHomeLayoutCustomized(defaults, [...defaultHidden].reverse()), false);
  assert.equal(layout.isHomeLayoutCustomized([], []), true);
});

test("saved order wins, unknown ids are dropped and new sections are appended", () => {
  assert.deepEqual(plain(layout.resolveHomeSectionOrder(["newReleases", "bogus", "listenNow", "newReleases"])), ["newReleases", "listenNow", "jumpBack", "dailyMixes", "recentlyPlayed", "mostListened", "newAlbums", "likedSongs", "rediscover", "notPlayedYet"]);
  assert.deepEqual(plain(layout.normalizeHomeHidden("listenNow")), []);
  assert.deepEqual(plain(layout.normalizeHomeHidden(["listenNow", "bogus", "listenNow"])), ["listenNow"]);
});

test("sections move one step and stop at the ends", () => {
  assert.deepEqual(plain(layout.moveHomeSection([], "listenNow", -1)).slice(0, 3), ["listenNow", "jumpBack", "dailyMixes"]);
  assert.deepEqual(plain(layout.moveHomeSection([], "jumpBack", -1)), defaults);
  assert.equal(layout.canMoveHomeSection([], "jumpBack", -1), false);
  assert.equal(layout.canMoveHomeSection([], "notPlayedYet", 1), false);
  assert.equal(layout.canMoveHomeSection([], "listenNow", 1), true);
  assert.equal(layout.isHomeLayoutCustomized(layout.moveHomeSection([], "listenNow", -1), defaultHidden), true);
});

test("hiding a section removes it from Home and keeps its place for later", () => {
  const hidden = layout.toggleHomeSectionHidden([], "mostListened");
  assert.deepEqual(plain(hidden), ["mostListened"]);
  assert.deepEqual(plain(layout.visibleHomeSections([], hidden)), defaults.filter((id) => id !== "mostListened"));
  assert.equal(layout.isHomeLayoutCustomized([], hidden), true);
  assert.deepEqual(plain(layout.toggleHomeSectionHidden(hidden, "mostListened")), []);
});

test("Customize Home edits the layout instead of opening Covers", () => {
  const home = read("src/features/home/HomeView.tsx");
  assert.match(home, /<HomeCustomizePanel/);
  assert.doesNotMatch(home, /className="homeCustomizeButton" type="button" onClick=\{openCoversViewWithCurrentSong\}/);
  assert.match(read("src/App.tsx"), /updateHomeLayout: \(patch\) => void updateSettingsPatch\(patch\)/);
  assert.match(read("src/features/settings/settings.constants.ts"), /homeSectionOrder:\[\],homeHiddenSections:\["likedSongs","rediscover","notPlayedYet"\]/);
  assert.match(read("src/features/home/HomeCustomizePanel.tsx"), /homeHiddenSections: \[\.\.\.defaultHiddenHomeSections\]/);
});

const picks = loadCommonJs("src/features/home/homeShelfPicks.ts");
const now = new Date("2026-10-19T12:00:00");
const daysAgo = (days) => new Date(now.getTime() - days * 86400000).toISOString();
const song = (id, extra = {}) => ({ id, title: id, artist: "a", filePath: `/m/${id}.mp3`, playCount: 0, liked: false, dateAdded: daysAgo(100), ...extra });
const ids = (list) => list.map((entry) => entry.id);

test("Recently played lists played songs newest first and skips missing files", () => {
  const songs = [song("old", { lastPlayed: daysAgo(5) }), song("never"), song("new", { lastPlayed: daysAgo(1) }), song("gone", { lastPlayed: daysAgo(0), fileExists: false })];
  assert.deepEqual(ids(picks.pickRecentlyPlayed(songs)), ["new", "old"]);
});

test("New albums puts the newest additions first", () => {
  const album = (id, latestAdded, songs = [song(id)]) => ({ id, title: id, artist: "a", songs, trackCount: songs.length, latestAdded });
  const albums = [album("older", 10), album("newest", 30), album("missing", 50, [song("x", { fileExists: false })]), album("middle", 20)];
  assert.deepEqual(ids(picks.pickNewAlbums(albums)), ["newest", "middle", "older"]);
});

test("Liked, Rediscover and Not played yet pick the right songs", () => {
  const songs = [
    song("liked-few", { liked: true, playCount: 1 }), song("liked-many", { liked: true, playCount: 9 }),
    song("forgotten", { playCount: 12, lastPlayed: daysAgo(60) }), song("recent-fave", { playCount: 20, lastPlayed: daysAgo(2) }),
    song("barely", { playCount: 1, lastPlayed: daysAgo(90) }), song("fresh-a"), song("fresh-b")
  ];
  assert.deepEqual(ids(picks.pickLikedSongs(songs)), ["liked-many", "liked-few"]);
  assert.deepEqual(ids(picks.pickRediscover(songs, now)), ["forgotten"]);
  const unplayed = ids(picks.pickNotPlayedYet(songs, now));
  assert.deepEqual([...unplayed].sort(), ["fresh-a", "fresh-b"]);
  assert.deepEqual(ids(picks.pickNotPlayedYet(songs, now)), unplayed, "the shuffle holds for the whole day");
});
