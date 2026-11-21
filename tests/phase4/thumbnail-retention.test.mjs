import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { pruneThumbnails } = createRequire(import.meta.url)("../../electron/runtime/thumbnail-retention.cjs");
test("thumbnail retention evicts only derived files and leaves user artwork intact", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),"localtify-thumbnail-"));
  try {
    const old=path.join(dir,"a".repeat(40)+".png"), recent=path.join(dir,"b".repeat(40)+".png"), permanent=path.join(dir,"user-cover.png");
    await fs.writeFile(old,"1234"); await fs.writeFile(recent,"5678"); await fs.writeFile(permanent,"original");
    await fs.utimes(old,100,100);
    const result=await pruneThumbnails(dir,{maxBytes:4,maxFiles:1});
    assert.equal(result.removed,1);
    assert.deepEqual(new Set(await fs.readdir(dir)),new Set([path.basename(recent),path.basename(permanent)]));
    assert.equal(await fs.readFile(permanent,"utf8"),"original");
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});

test("active thumbnails count against retention budgets without being deleted", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "localtify-thumbnail-active-"));
  try {
    const active = path.join(dir, "a".repeat(40) + ".png");
    const ordinary = path.join(dir, "b".repeat(40) + ".png");
    await fs.writeFile(active, "1234");
    await fs.writeFile(ordinary, "5678");
    const result = await pruneThumbnails(dir, { maxBytes: 4, maxFiles: 1, active: file => file === active });
    assert.equal(result.removed, 1);
    assert.equal(result.bytes, 4);
    assert.equal(result.count, 1);
    assert.deepEqual(await fs.readdir(dir), [path.basename(active)]);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test("portrait and landscape artwork fill square thumbnails without black padding or source edits", async () => {
  const require = createRequire(import.meta.url);
  const { createThumbnailRuntime } = require("../../electron/runtime/thumbnail-runtime.cjs");
  const { createHash } = require("node:crypto");
  const { execFileSync } = require("node:child_process");
  const { existsSync, statSync } = require("node:fs");
  const ffmpeg = require("ffmpeg-static");
  assert.ok(ffmpeg && existsSync(ffmpeg), "the bundled FFmpeg encoder must be available");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "localtify-square-cover-"));
  const songs = [];
  const runtime = createThumbnailRuntime({
    getUserDataPath: () => dir, getFileInfoCached: file => statSync(file),
    filePathKey: file => file, fileExists: existsSync, isImageFile: () => true,
    safeMediaUrl: file => file, invalidateFileInfo: () => {}, clearFileInfoCache: () => {},
    getFfmpegPath: () => ffmpeg, getSongs: () => songs, getSong: id => songs.find(song => song.id === id),
    getRuntimeCoverPath: song => song.coverPath, publish: () => {}
  });
  try {
    const cache = path.join(dir, "thumbnails");
    await fs.mkdir(cache);
    for (const [width, height] of [[19, 57], [57, 19], [19, 19]]) {
      const source = path.join(dir, width + "x" + height + ".ppm");
      const pixels = Buffer.alloc(width * height * 3);
      for (let i = 0; i < pixels.length; i += 3) { pixels[i] = 255; pixels[i + 1] = 31; pixels[i + 2] = 97; }
      const original = Buffer.concat([Buffer.from("P6\n" + width + " " + height + "\n255\n"), pixels]);
      await fs.writeFile(source, original);
      const info = statSync(source);
      const legacy = path.join(cache, createHash("sha1").update([source, info.size, Math.round(info.mtimeMs), 256].join("|")).digest("hex") + ".png");
      // Old derived files are not selected, even before the bounded cache prunes them.
      await fs.writeFile(legacy, "old padded thumbnail");
      songs.push({ id: source, coverPath: source });
      assert.equal(runtime.getCoverThumbnailUrl(source), "");
      const result = await runtime.warmCoverThumbnails({ limit: 3 });
      // The scheduler may already own the same job; wait through the warmup's
      // existing shared create promise rather than spinning a second encoder.
      assert.equal(result.ok, true);
      const thumbnail = runtime.getCoverThumbnailUrl(source);
      assert.ok(thumbnail && thumbnail !== legacy, "a new cache identity must be used");
      const raw = execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", thumbnail, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1024 * 1024 });
      assert.equal(raw.length, 256 * 256 * 3);
      for (const offset of [0, (256 - 1) * 3, (256 * 255) * 3, raw.length - 3]) {
        assert.deepEqual([...raw.subarray(offset, offset + 3)], [255, 31, 97], "every corner must use source pixels");
      }
      assert.deepEqual(await fs.readFile(source), original);
    }
  } finally { runtime.stop(); await fs.rm(dir, { recursive: true, force: true }); }
});
