import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const main = fs.readFileSync(path.join(root, "electron", "main.cjs"), "utf8");

function numericConstant(name) {
  const match = main.match(new RegExp(`const\\s+${name}\\s*=\\s*(\\d+)`));
  return match ? Number(match[1]) : NaN;
}

test("bulk album scanning stays bounded and yields to Electron", () => {
  const depth = numericConstant("ALBUM_FOLDER_LIBRARY_SCAN_MAX_DEPTH");
  const scanYield = numericConstant("ALBUM_FOLDER_SCAN_YIELD_EVERY_TRACKS");
  const importYield = numericConstant("ALBUM_FOLDER_IMPORT_YIELD_EVERY_TRACKS");

  assert.ok(Number.isFinite(depth) && depth > 0 && depth <= 6, "album library recursion must stay bounded");
  assert.ok(Number.isFinite(scanYield) && scanYield > 0 && scanYield <= 16, "album scan must periodically yield to the event loop");
  assert.ok(Number.isFinite(importYield) && importYield > 0 && importYield <= 24, "album import must periodically yield to the event loop");
  assert.match(main, /await\s+yieldToMainLoop\(\)/, "album folder work no longer yields to Electron");
});

test("nested album scans prefer each album folder's own cover", () => {
  assert.match(main, /folderCoverPath\s*\|\|\s*albumEmbeddedCoverPath/, "folder cover is no longer preferred over embedded fallback");
  assert.match(main, /preferFolderCover:\s*Boolean\(folderCoverPath\)/, "folder-cover preference is not carried into metadata repair");
  assert.match(fs.readFileSync(path.join(root, "electron/runtime/library-import.cjs"), "utf8"), /preferFolderCover:\s*Boolean\(options.preferFolderCover\)/, "import must forward the explicit folder preference");
  assert.match(main, /sourcePath:\s*folderPath/, "album preview must retain the exact child folder source path");
});

test("folder imports prefer album metadata and fall back to the folder name", () => {
  assert.match(
    main,
    /const\s+albumTitle\s*=\s*cleanAlbumFolderText\(tagAlbumTitle,\s*folderTitle\)/,
    "the dominant embedded album tag must win when metadata is available"
  );
  assert.doesNotMatch(
    main,
    /cleanAlbumFolderText\(folderTitle\s*\|\|\s*tagAlbumTitle/,
    "a present folder name must not mask embedded album metadata"
  );
});

test("album filename parsing is pure and keeps original song and folder identity", () => {
  const require = createRequire(import.meta.url);
  const { cleanAlbumFolderText, parseAlbumTrackFileName, albumTrackNumberFromFileName } =
    require("../../electron/runtime/album-import-utils.cjs");
  assert.equal(cleanAlbumFolderText("  Album__Name "), "Album Name");
  const parsed = parseAlbumTrackFileName("/music/Artist - Song.mp3", "Folder__Album");
  assert.deepEqual(parsed, { title: "Song", artist: "Artist", album: "Folder Album" });
  assert.equal(albumTrackNumberFromFileName("/music/09 - Song.mp3"), 9);
  assert.equal(albumTrackNumberFromFileName("/music/Untitled.mp3", 2), 3);
});

test("MusicBrainz album downloads keep canonical recording identities", () => {
  const require = createRequire(import.meta.url);
  const { musicBrainzRecordingUrl } = require("../../electron/discover/track-identity.cjs");
  const { normalizeRequest } = require("../../electron/download-jobs.cjs");
  const id = "mb0123456789abcdef0123456789abcdef";
  const url = "https://musicbrainz.org/recording/01234567-89ab-cdef-0123-456789abcdef";
  assert.equal(musicBrainzRecordingUrl(id), url);
  assert.equal(normalizeRequest({ source:"spotify", url, folder:root, track:{ id } }).url, url);
  assert.throws(() => normalizeRequest({
    source:"spotify", url:"https://open.spotify.com/track/" + id, folder:root, track:{ id }
  }), /identity/);
});
