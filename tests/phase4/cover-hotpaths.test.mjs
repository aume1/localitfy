import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import { runInNewContext } from "node:vm";

const src = fs.readFileSync("src/features/covers/cover.runtime.ts", "utf8");
const compiled = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const exports = {};
const dependencies = {
  "./pixelArt": {
    DEFAULT_RUNTIME_PIXEL_ART_ASSETS: [],
    getCachedRuntimePixelArtAssets: () => [],
    cleanStringList: (items) => items.filter(Boolean),
    getPixelArtAssetKey: (asset) => asset.path || asset.url || asset.file
  },
  "../settings/settings.constants": { coverMoodOptions: [] }
};
runInNewContext(compiled, {
  exports, require: (name) => dependencies[name]
});
const pick = exports.selectBalancedPixelAsset;

function reference(pool, song, usage, salt) {
  const keys = new Set([song.coverPath, song.coverUrl].filter(Boolean));
  const ranked = pool.map((asset, index) => ({
    asset,
    current: keys.has(asset.path || "") || keys.has(asset.url || "") || keys.has(asset.file || ""),
    usage: usage.get(asset.path || asset.url || asset.file) || 0,
    score: exports.stableHash(exports.songSignature(song) + "::" + salt + "::" + index + "::" + asset.file)
  })).filter((entry) => pool.length <= 1 || !entry.current).sort((a, b) => a.usage - b.usage || a.score - b.score);
  return ranked[0]?.asset || pool[0] || null;
}

test("linear cover selection preserves stable usage and tie ordering", () => {
  const pool = Array.from({ length: 80 }, (_, index) => ({ file: "cover" + index, path: "/art/" + index, label: "art" }));
  const usage = new Map(pool.map((asset, index) => [asset.path, index % 7]));
  for (let i = 0; i < 200; i += 1) {
    const song = { id: "song-" + i, title: "track", artist: "someone", album: "an album", duration: 123, filePath: "C:\\music\\" + i, coverPath: pool[i % pool.length].path };
    assert.equal(pick(pool, song, usage, "seed-" + i)?.file, reference(pool, song, usage, "seed-" + i)?.file);
  }
});

test("cover picker preserves single-item and all-current fallback behavior", () => {
  const single = { file: "one", path: "/one" };
  const song = { id: "song", coverPath: "/one" };
  assert.equal(pick([], song, new Map(), "s"), null);
  assert.equal(pick([single], song, new Map(), "s")?.file, "one");
  assert.equal(pick([single, { ...single }], song, new Map(), "s")?.file, "one");
});

test("bulk cover updates use pre-indexed song locations", () => {
  const source = fs.readFileSync("src/features/covers/useCoversController.ts", "utf8");
  assert.doesNotMatch(source, /nextSongs\.findIndex/);
  assert.equal(source.split("const songIndexById = new Map").length - 1, 2);
  assert.match(source, /selectBalancedPixelAsset/);
});
