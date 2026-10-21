import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { parseLrc, cleanTitle, primaryArtist } = require(path.join(root, "electron", "lyrics", "lrc.cjs"));
const { createLyricsService } = require(path.join(root, "electron", "lyrics", "service.cjs"));

const SYNCED = "[ar:Nobody]\n[00:01.50]first line\n[00:04.25][00:20.00]repeated line\n[00:08.00]\n[00:09.123]<00:09.20>word <00:09.80>sync";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "localtify-lyrics-"));
}

function fakeFetch(routes) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const endpoint = new URL(url).pathname.split("/").pop();
    const body = routes[endpoint];
    if (body === undefined) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => body };
  };
  return { fetchImpl, calls };
}

const song = { id: "s1", title: "Made Up Song (Official Video)", artist: "Nobody feat. Someone", album: "Demo", duration: 200.4, filePath: "" };

test("parseLrc sorts timestamps, repeats lines, strips word tags and applies offset", () => {
  const lines = parseLrc(SYNCED);
  assert.deepEqual(lines.map((line) => line.text), ["first line", "repeated line", "", "word sync", "repeated line"]);
  assert.equal(lines[0].time, 1.5);
  assert.equal(lines[3].time, 9.123);
  assert.equal(parseLrc("[offset:+500]\n[00:02.00]shifted")[0].time, 1.5);
  assert.deepEqual(parseLrc("no timestamps here"), []);
});

test("lookup text drops video noise and featured artists", () => {
  assert.equal(cleanTitle("Made Up Song (Official Video) [HD]"), "Made Up Song");
  assert.equal(cleanTitle("Made Up Song (feat. Someone)"), "Made Up Song");
  assert.equal(primaryArtist("Nobody, Someone & Other"), "Nobody");
  assert.equal(primaryArtist("Nobody - Topic"), "Nobody");
});

test("service prefers a sidecar .lrc file and never goes online for it", async () => {
  const dir = tempDir();
  const filePath = path.join(dir, "track.mp3");
  fs.writeFileSync(path.join(dir, "track.lrc"), SYNCED);
  const { fetchImpl, calls } = fakeFetch({});
  const service = createLyricsService({ cacheDir: path.join(dir, "cache"), userAgent: "test", fetchImpl });
  const result = await service.get({ ...song, filePath }, { online: true });
  assert.equal(result.status, "synced");
  assert.equal(result.source, "file");
  assert.equal(calls.length, 0);
});

test("service queries LRCLIB with cleaned text, caches hits, and respects offline mode", async () => {
  const dir = tempDir();
  const { fetchImpl, calls } = fakeFetch({ get: { duration: 200, syncedLyrics: SYNCED, plainLyrics: "first line" } });
  const service = createLyricsService({ cacheDir: dir, userAgent: "test", fetchImpl });
  const result = await service.get(song);
  assert.equal(result.status, "synced");
  assert.equal(result.source, "lrclib");
  const params = new URL(calls[0]).searchParams;
  assert.equal(params.get("track_name"), "Made Up Song");
  assert.equal(params.get("artist_name"), "Nobody");
  assert.equal(params.get("duration"), "200");

  await service.get(song);
  assert.equal(calls.length, 1, "second lookup is served from the cache");
  assert.equal((await service.get(song, { refresh: true })).status, "synced");
  assert.equal(calls.length, 2);

  assert.equal((await service.get({ ...song, id: "s2", title: "Other" }, { online: false })).status, "offline");
  assert.equal(calls.length, 2);
});

test("service falls back to search, picks synced results near the song length, and reports misses", async () => {
  const { fetchImpl } = fakeFetch({ search: [
    { duration: 260, syncedLyrics: SYNCED },
    { duration: 201, plainLyrics: "plain only" },
    { duration: 199, syncedLyrics: "[00:00.50]closest synced" }
  ] });
  const service = createLyricsService({ cacheDir: tempDir(), userAgent: "test", fetchImpl });
  const result = await service.get(song);
  assert.equal(result.status, "synced");
  assert.equal(result.lines[0].text, "closest synced");

  const empty = createLyricsService({ cacheDir: tempDir(), userAgent: "test", fetchImpl: fakeFetch({ search: [] }).fetchImpl });
  assert.equal((await empty.get(song)).status, "missing");
});

test("service turns network failures into an error result without caching them", async () => {
  let attempts = 0;
  const fetchImpl = async () => { attempts += 1; throw new Error("offline"); };
  const service = createLyricsService({ cacheDir: tempDir(), userAgent: "test", fetchImpl });
  const result = await service.get(song);
  assert.equal(result.status, "error");
  await service.get(song);
  assert.equal(attempts, 2);
});

test("service retries a single LRCLIB server error", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    return attempts === 1
      ? { ok: false, status: 503, json: async () => ({}) }
      : { ok: true, status: 200, json: async () => ({ syncedLyrics: SYNCED }) };
  };
  const service = createLyricsService({ cacheDir: tempDir(), userAgent: "test", fetchImpl, retryDelayMs: 0 });
  assert.equal((await service.get(song)).status, "synced");
  assert.equal(attempts, 2);
});

test("lyrics IPC is gated by settings and resolves songs natively", () => {
  const source = fs.readFileSync(path.join(root, "electron", "ipc", "lyrics.cjs"), "utf8");
  assert.match(source, /lyricsEnabled !== true/);
  assert.match(source, /repositories\.songs\.get\(/);
  assert.match(fs.readFileSync(path.join(root, "electron", "main.cjs"), "utf8"), /registerLyricsIpc\(ipcRouter/);
});
