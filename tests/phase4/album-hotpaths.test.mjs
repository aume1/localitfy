import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import { runInNewContext } from "node:vm";

const read = (path) => fs.readFileSync(path, "utf8");
const playable = (song) => !!song && Boolean(song.filePath || song.url) && song.fileExists !== false;
const prettyTitle = (value) => String(value || "").toLowerCase().trim();
const exports = {};
const { outputText } = ts.transpileModule(read("src/features/albums/album.runtime.ts"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
});
const dependencies = {
  "../library/library.utils": { isPlayableSong: playable },
  "../../shared/storage/localStorage": { makeLocalId: () => "test" },
  "../search/search.utils": { prettyTitle, prettyMeta: (s) => s },
  "../covers/Cover": { getCardCoverUrl: () => "" },
  "../covers/cover.ambient": { getRendererSafeImageUrl: (s) => s || "" }
};
runInNewContext(outputText, {
  exports,
  require(name) {
    if (!Object.hasOwn(dependencies, name)) throw new Error("Unexpected dependency: " + name);
    return dependencies[name];
  }
});

const song = (id, patch = {}) => ({
  id: String(id), title: "Track " + id, artist: "Artist " + (id % 23),
  album: "Album " + (id % 37), filePath: "/music/" + id + ".flac",
  dateAdded: "2026-10-01T00:00:00.000Z", duration: 90 + id % 130,
  playCount: 0, fileExists: true, ...patch
});
const ids = (items) => Array.from(items, (s) => s.id);

function reference(items, query, selectedIds, limit) {
  const selected = new Set(selectedIds);
  return items.filter(playable)
    .filter((entry) => exports.albumSongSearchMatches(entry, query))
    .sort((a, b) => (selected.has(a.id) ? 0 : 1) - (selected.has(b.id) ? 0 : 1)
      || prettyTitle(a.title).localeCompare(prettyTitle(b.title)))
    .slice(0, limit);
}

test("album editor bounded selection preserves title order, selected priority, and stable ties", () => {
  const songs = Array.from({ length: 12000 }, (_, id) =>
    song(id, { title: "Track " + id % 43, fileExists: id % 53 !== 0 })
  );
  const selected = ["77", "90", "13", "111", "11999"];
  for (const query of ["", "track", "artist 1", "album 9", "absent"]) {
    for (const limit of [0, 1, 10, 80, 140]) {
      assert.deepEqual(
        ids(exports.pickAlbumDraftSearchResults(songs, query, selected, limit)),
        ids(reference(songs, query, selected, limit)),
        "query " + query + " limit " + limit
      );
    }
  }
  assert.deepEqual(ids(exports.pickAlbumDraftSearchResults(songs, "track", selected, 80)),
    ids(exports.pickAlbumDraftSearchResults(songs, "track", selected, 80)));
});

test("manual album totals stay accurate without spread argument limits", () => {
  const songs = Array.from({ length: 6000 }, (_, id) => song(id, {
    dateAdded: id === 5999 ? "2026-10-17T00:00:00.000Z" : "2026-10-01T00:00:00.000Z"
  }));
  const byId = new Map(songs.map((entry) => [entry.id, entry]));
  const manual = [{
    id: "long-album", title: "Many tracks", artist: "Artist", year: null,
    songIds: songs.map((entry) => entry.id), createdAt: 0, updatedAt: 1,
    coverUrl: "", sourceType: "manual"
  }];
  const list = exports.buildManualAlbumEntries(manual, byId);
  assert.equal(list.length, 1);
  assert.equal(list[0].trackCount, songs.length);
  assert.equal(list[0].latestAdded, Date.parse("2026-10-17T00:00:00.000Z"));
  assert.equal(list[0].totalDuration, songs.reduce((sum, entry) => sum + entry.duration, 0));
  assert.equal(list[0].songs[0].id, "0");
});

test("album editor does not search and sort songs while closed", () => {
  const controller = read("src/features/albums/useAlbumsController.ts");
  assert.match(controller, /albumBuilderOpen \? pickAlbumDraftSearchResults\(songs, albumDraftSearch, albumDraftSongIds\) : \[\]/);
  assert.match(controller, /\[albumBuilderOpen, songs, albumDraftSearch, albumDraftSongIds\]/);
});

test("tagged albums group tracks and preserve track totals", () => {
  const songs = [
    song(1, {album:"First Record",artist:"Mika",coverPath:"/covers/one.jpg",duration:100}),
    song(2, {album:"First Record",artist:"Mika",duration:120}),
    song(3, {album:"Second Record",artist:"Mika",duration:130}),
    song(4, {album:"unknown album",artist:"Mika",duration:100})
  ];
  const records=exports.buildLocalAlbumEntries(songs);
  assert.equal(records.length,2);
  const first=records.find(record=>record.title==="First Record");
  assert.ok(first);
  assert.equal(first.trackCount,2);
  assert.equal(first.totalDuration,220);
  assert.deepEqual(ids(first.songs),["1","2"]);
  assert.equal(first.coverSong.id,"1");
});

test("compilation tracks in one folder form one album in track order", () => {
  const tracks = [
    song(1, { album: "Soundtrack", artist: "Singer A", filePath: "/music/Soundtrack/02 - Finale.flac", duration: 180 }),
    song(2, { album: "Soundtrack", artist: "Singer B", filePath: "/music/Soundtrack/01 - Opening.flac", duration: 120 }),
    song(3, { album: "Another", artist: "Singer C", filePath: "/music/Soundtrack/03 - Other.flac" })
  ];
  const albums = exports.buildLocalAlbumEntries(tracks);
  assert.equal(albums.length, 2);
  const soundtrack = albums.find(item => item.title === "Soundtrack");
  assert.ok(soundtrack);
  assert.equal(soundtrack.artist, "Various Artists");
  assert.equal(soundtrack.trackCount, 2);
  assert.deepEqual(ids(soundtrack.songs), ["2", "1"]);
});

test("same-title albums in separate artist folders stay distinct", () => {
  const tracks = [
    song(1, { album: "Greatest Hits", artist: "Singer A", filePath: "/music/A/01.flac" }),
    song(2, { album: "Greatest Hits", artist: "Singer B", filePath: "/music/B/01.flac" }),
    song(3, { album: "Greatest Hits", artist: "Singer A", filePath: "/music/A/02.flac" })
  ];
  const albums = exports.buildLocalAlbumEntries(tracks);
  assert.equal(albums.length, 2);
  assert.equal(albums.find(item => item.artist === "Singer A")?.trackCount, 2);
});

test("non-Latin album titles have distinct stable identities", () => {
  const albums = exports.buildLocalAlbumEntries([
    song(1, { artist: "A", album: "夜空" }),
    song(2, { artist: "A", album: "春風" })
  ]);
  assert.equal(albums.length, 2);
  assert.notEqual(albums[0].id, albums[1].id);
});

test("Unicode marks keep distinct albums and POSIX paths keep their case", () => {
  assert.notEqual(exports.albumKeyPart("दिन"), exports.albumKeyPart("दीन"));
  const albums = exports.buildLocalAlbumEntries([
    song(1, { artist: "Artist", album: "दिन" }),
    song(2, { artist: "Artist", album: "दीन" })
  ]);
  assert.equal(albums.length, 2);
  assert.notEqual(exports.normalizeFolderAlbumPathKey("/music/Record"), exports.normalizeFolderAlbumPathKey("/music/record"));
  assert.equal(exports.normalizeFolderAlbumPathKey("C:\\Music\\Record"), exports.normalizeFolderAlbumPathKey("c:\\music\\record"));
});

test("custom album artwork takes priority over embedded track artwork", () => {
  const track = song(1, { coverSource: "embedded", coverPath: "/music/embedded.png" });
  const selected = "https://example.com/custom.png";
  const cover = exports.pickManualAlbumCoverSong({
    id: "manual", title: "Album", artist: "Artist", songIds: [track.id],
    coverUrl: selected, coverPath: "/music/embedded.png", sourceType: "manual"
  }, [track]);
  assert.equal(cover.coverUrl, selected);
});

test("album edit preserves missing IDs and ignores stale cover picks", () => {
  const controller = read("src/features/albums/useAlbumsController.ts");
  assert.match(controller, /setAlbumDraftSongIds\(\[\.\.\.new Set\(manual\.songIds\)\]\)/);
  assert.match(controller, /albumBuilderMode === "edit" \? \[\.\.\.new Set\(albumDraftSongIds\)\] : playableSongIds/);
  assert.match(controller, /if \(request !== albumCoverRequestRef\.current\) return/);
  assert.match(controller, /function deleteEditingManualAlbum\(\)/);
});
