import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const app = fs.readFileSync("src/App.tsx", "utf8");

test("missing-file counts come directly from the current library", () => {
  assert.match(app, /const effectiveMissingFileCount = missingSongs\.length;/);
  assert.doesNotMatch(app, /useAnalyticsRuntime/);
});

test("database saves reject failures and optimistic song edits roll back", () => {
  const db = fs.readFileSync("electron/db.cjs", "utf8");
  const main = fs.readFileSync("electron/main.cjs", "utf8");
  const app = fs.readFileSync("src/App.tsx", "utf8");
  assert.match(db, /settings save failed:[^\n]*\n\s*throw error;/);
  assert.match(db, /playlist save failed:[^\n]*\n\s*throw error;/);
  assert.match(main, /playlists:save[^\n]*=> savePlaylists\(playlists\)/);
  assert.match(app, /Object\.is\(song\[key\], patch\[key\]\)/, "only still-matching optimistic fields are rolled back");
  assert.match(app, /Could not save song changes/);
});
