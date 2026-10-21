const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { parseLrc, plainLines, cleanTitle, primaryArtist } = require("./lrc.cjs");

const LRCLIB = "https://lrclib.net/api";
const MISS_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
const DURATION_TOLERANCE_S = 4;

function shapeResult(source, { synced = "", plain = "", instrumental = false } = {}) {
  const lines = parseLrc(synced);
  if (lines.length) return { status: "synced", source, lines };
  const text = plainLines(plain || synced);
  if (text.length) return { status: "plain", source, lines: text.map((line) => ({ time: -1, text: line })) };
  return { status: instrumental ? "instrumental" : "missing", source, lines: [] };
}

function createLyricsService({ cacheDir, userAgent, fetchImpl = globalThis.fetch, now = Date.now, retryDelayMs = 700 }) {
  const pending = new Map();
  const cacheFile = (key) => path.join(cacheDir, `${key}.json`);

  async function readCache(key) {
    try {
      const entry = JSON.parse(await fs.readFile(cacheFile(key), "utf8"));
      if (entry?.result?.status === "missing" && now() - Number(entry.savedAt || 0) > MISS_TTL_MS) return null;
      return entry?.result || null;
    } catch { return null; }
  }

  async function writeCache(key, result) {
    try {
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(cacheFile(key), JSON.stringify({ savedAt: now(), result }));
    } catch { /* cache is best-effort */ }
  }

  async function readSidecar(filePath) {
    if (!filePath) return null;
    const base = filePath.slice(0, filePath.length - path.extname(filePath).length);
    for (const candidate of [`${base}.lrc`, `${base}.LRC`]) {
      try {
        const text = await fs.readFile(candidate, "utf8");
        const result = shapeResult("file", { synced: text, plain: text });
        if (result.lines.length) return result;
      } catch { /* no sidecar */ }
    }
    return null;
  }

  async function request(endpoint, params) {
    const url = `${LRCLIB}/${endpoint}?${new URLSearchParams(params)}`;
    const send = () => fetchImpl(url, { headers: { "User-Agent": userAgent, Accept: "application/json" }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    let response = await send();
    // LRCLIB returns frequent 503s under load; a short backoff usually clears them.
    for (let attempt = 1; attempt <= 2 && response.status >= 500; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
      response = await send();
    }
    if (response.status === 404) return null;
    if (response.status >= 500) throw new Error("LRCLIB is busy right now, try again in a moment");
    if (!response.ok) throw new Error(`lyrics lookup failed (${response.status})`);
    return response.json();
  }

  async function lookupOnline(song) {
    const track = cleanTitle(song.title);
    const artist = primaryArtist(song.artist);
    if (!track) return { status: "missing", source: "lrclib", lines: [] };
    const duration = Math.round(Number(song.duration) || 0);
    const exact = artist && duration > 0
      ? await request("get", { track_name: track, artist_name: artist, album_name: cleanTitle(song.album), duration: String(duration) })
      : null;
    if (exact && (exact.syncedLyrics || exact.plainLyrics || exact.instrumental)) {
      return shapeResult("lrclib", { synced: exact.syncedLyrics, plain: exact.plainLyrics, instrumental: exact.instrumental });
    }
    const found = await request("search", artist ? { track_name: track, artist_name: artist } : { q: track });
    const candidates = (Array.isArray(found) ? found : [])
      .filter((item) => !duration || !item.duration || Math.abs(item.duration - duration) <= DURATION_TOLERANCE_S)
      .sort((a, b) => Number(Boolean(b.syncedLyrics)) - Number(Boolean(a.syncedLyrics))
        || Math.abs((a.duration || duration) - duration) - Math.abs((b.duration || duration) - duration));
    const best = candidates[0];
    return best
      ? shapeResult("lrclib", { synced: best.syncedLyrics, plain: best.plainLyrics, instrumental: best.instrumental })
      : { status: "missing", source: "lrclib", lines: [] };
  }

  async function get(song, { online = true, refresh = false } = {}) {
    if (!song) return { status: "missing", source: "none", lines: [] };
    const sidecar = await readSidecar(song.filePath);
    if (sidecar) return sidecar;
    if (!online) return { status: "offline", source: "none", lines: [] };
    const key = crypto.createHash("sha1")
      .update([cleanTitle(song.title), primaryArtist(song.artist), Math.round(Number(song.duration) || 0)].join("\u0000").toLowerCase())
      .digest("hex");
    if (!refresh) {
      const cached = await readCache(key);
      if (cached) return cached;
    }
    if (pending.has(key)) return pending.get(key);
    const work = lookupOnline(song)
      .then(async (result) => { await writeCache(key, result); return result; })
      .catch((error) => ({ status: "error", source: "lrclib", lines: [], error: error?.name === "TimeoutError" ? "lyrics lookup timed out" : String(error?.message || error) }))
      .finally(() => pending.delete(key));
    pending.set(key, work);
    return work;
  }

  async function clearCache() {
    await fs.rm(cacheDir, { recursive: true, force: true });
    return true;
  }

  return { get, clearCache };
}

module.exports = { createLyricsService, shapeResult };
