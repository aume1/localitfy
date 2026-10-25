import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const electron = (file) => require(path.join(root, "electron", file));
const { summarizeAudit, createTagAuditor } = electron("musicbrainz/audit.cjs");
const { createMusicBrainzClient } = electron("musicbrainz/client.cjs");
const { similarity, pickRecording, formatGenres, matchReleaseTracks } = electron("musicbrainz/match.cjs");
const { createTaggingLookup, searchTitle } = electron("musicbrainz/lookup.cjs");
const { withMusicBrainzUfid, ffmpegArgs, writeMusicBrainzTags } = electron("musicbrainz/tag-writer.cjs");
const { registerTaggingIpc } = electron("ipc/tagging.cjs");
const { parseFile, parseBuffer } = await import("music-metadata");

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "localtify-tagging-"));
const JPEG = Buffer.from("ffd8ffe000104a46494600010100000100010000ffd9", "hex");

test("summarizeAudit groups untagged songs by album and singles by artist, and finds split albums", () => {
  const songs = [
    { id: "a1", album: "Melodrama", artist: "Lorde", filePath: "/m/Lorde/Melodrama/1.mp3" },
    { id: "a2", album: "Melodrama", artist: "Lorde", filePath: "/m/Lorde/Melodrama/2.mp3" },
    { id: "b1", album: "Camp", artist: "Childish Gambino", filePath: "/m/Camp/1.flac" },
    { id: "b2", album: "Camp", artist: "Childish Gambino", filePath: "/m/Camp/2.flac" },
    { id: "s1", album: "local files", artist: "Kanye West", filePath: "/d/k1.mp3" },
    { id: "s2", album: "local files", artist: "Kanye West", filePath: "/d/k2.mp3" },
    { id: "gone", album: "Camp", artist: "Childish Gambino", filePath: "/m/Camp/3.flac" }
  ];
  const ids = new Map([
    ["a1", { recordingId: "r1", releaseId: "rel-1" }], ["a2", { recordingId: "r2", releaseId: "rel-2" }],
    ["b1", { recordingId: "r3", releaseId: "rel-3" }], ["b2", { recordingId: "", releaseId: "" }],
    ["s1", { recordingId: "", releaseId: "" }], ["s2", { recordingId: "", releaseId: "" }]
  ]);
  const audit = summarizeAudit(songs, ids);
  assert.deepEqual([audit.total, audit.tagged, audit.missing, audit.untaggedCount], [7, 3, 1, 3]);
  assert.deepEqual(audit.untagged.map((group) => [group.album, group.artist, group.untaggedIds]), [["", "Kanye West", ["s1", "s2"]], ["Camp", "Childish Gambino", ["b2"]]]);
  assert.deepEqual(audit.splitAlbums.map((group) => [group.album, group.releaseCount]), [["Melodrama", 2]]);
});

test("the auditor re-reads a file only when it changed", async () => {
  let parses = 0;
  let mtimeMs = 1;
  const auditor = createTagAuditor({ parseFile: async () => { parses += 1; return { common: { musicbrainz_recordingid: parses > 1 ? "rec" : undefined } }; }, stat: async () => ({ mtimeMs, size: 10 }) });
  const songs = [{ id: "1", album: "A", artist: "B", filePath: "/x.mp3" }];
  assert.equal((await auditor.audit(songs)).tagged, 0);
  assert.equal((await auditor.audit(songs)).tagged, 0);
  assert.equal(parses, 1);
  mtimeMs = 2;
  assert.equal((await auditor.audit(songs)).tagged, 1);
});

test("titles lose credits and upload noise before searching and matching", () => {
  assert.equal(searchTitle("High (& Dua Lipa)"), "High");
  assert.equal(searchTitle("family ties (with Kendrick Lamar)"), "family ties");
  assert.equal(searchTitle("Heartless (Official Audio)"), "Heartless");
  assert.equal(similarity("Ain't In LA", "Ain’t in LA"), 1);
  assert.equal(similarity("RADIO (feat. Kim Petras)", "RADIO"), 1);
  assert.equal(formatGenres([{ name: "hip hop", count: 10 }, { name: "synth-pop", count: 5 }, { name: "jazz", count: 1 }]), "Hip Hop; Synth-Pop");
});

test("pickRecording prefers the original album over compilations and soundtracks of the same song", () => {
  const credit = [{ name: "Kanye West", artist: { id: "kanye" } }];
  const release = (id, title, type, secondary = [], date = "2008") => ({ id, title, status: "Official", date, "release-group": { id: `rg-${id}`, "primary-type": type, "secondary-types": secondary }, media: [{ position: 1, "track-count": 12, "track-offset": 2, track: [{ id: `t-${id}`, number: "3" }] }] });
  const recordings = [
    { id: "comp", title: "Heartless", length: 211000, "artist-credit": credit, releases: [release("c", "R&B Collection", "Album", ["Compilation"])] },
    { id: "orig", title: "Heartless", length: 211500, "artist-credit": credit, releases: [release("o", "808s & Heartbreak", "Album")] },
    { id: "other", title: "Heartbeat", length: 180000, "artist-credit": credit, releases: [release("x", "Something", "Album", [], "2001")] }
  ];
  const picked = pickRecording({ title: "Heartless", artist: "Kanye West", durationMs: 211000 }, recordings);
  assert.equal(picked.recording.id, "orig");
  assert.equal(picked.release.title, "808s & Heartbreak");
  assert.equal(picked.track.number, "3");
});

test("matchReleaseTracks pairs songs with release tracks one to one", () => {
  const release = { media: [{ position: 1, tracks: [
    { id: "t1", title: "madeleine", length: 150000, recording: { id: "r1", title: "madeleine", length: 150000 } },
    { id: "t2", title: "death rolL", length: 200000, recording: { id: "r2", title: "death rolL", length: 200000 } }
  ] }] };
  const matches = matchReleaseTracks([{ id: "b", title: "death roll", durationMs: 199000 }, { id: "a", title: "Madeleine", durationMs: 151000 }, { id: "c", title: "unrelated", durationMs: 90000 }], release);
  assert.deepEqual(matches.map((match) => [match.song.id, match.track.id]).sort(), [["a", "t1"], ["b", "t2"]]);
});

test("the client identifies itself, stays at one request per interval and retries 503s", async () => {
  const calls = [];
  const sleeps = [];
  const responses = [{ status: 503 }, { status: 200, body: { recordings: [{ id: "r" }] } }, { status: 200, body: { releases: [] } }];
  const client = createMusicBrainzClient({
    userAgent: "localtify/test ( x )", minIntervalMs: 1000, sleep: async (ms) => { sleeps.push(ms); },
    fetchImpl: async (url, options) => { calls.push({ url, agent: options.headers["User-Agent"] }); const next = responses.shift(); return { ok: next.status === 200, status: next.status, json: async () => next.body }; }
  });
  assert.deepEqual(await client.searchRecordings('Say "Hi"', "Artist"), [{ id: "r" }]);
  await client.searchReleases("Album", "Artist");
  assert.equal(calls.length, 3);
  assert.ok(calls.every((call) => call.agent === "localtify/test ( x )"));
  assert.equal(new URL(calls[0].url).searchParams.get("query"), 'recording:"Say \\"Hi\\"" AND artist:"Artist"');
  assert.ok(sleeps.some((ms) => ms >= 2000), "backs off after a 503");
});

function fakeMusicBrainz() {
  const credit = [{ name: "brakence", joinphrase: "", artist: { id: "brakence" } }];
  const release = {
    id: "rel-marrow", title: "marroW", status: "Official", date: "2026-01-01", country: "XW", "artist-credit": credit,
    "release-group": { id: "rg-marrow", "primary-type": "Album", "secondary-types": [] },
    media: [{ position: 1, "track-count": 2, tracks: [
      { id: "t1", position: 1, title: "madeleine", length: 150000, "artist-credit": credit, recording: { id: "rec-1", title: "madeleine", length: 150000, "artist-credit": credit } },
      { id: "t2", position: 2, title: "death rolL", length: 200000, "artist-credit": credit, recording: { id: "rec-2", title: "death rolL", length: 200000, "artist-credit": credit } }
    ] }]
  };
  const coverRequests = [];
  const fetchImpl = async (url) => {
    if (url.startsWith("https://coverartarchive.org/")) { coverRequests.push(url); return { ok: true, status: 200, headers: new Map([["content-type", "image/jpeg"]]), arrayBuffer: async () => JPEG }; }
    const { pathname } = new URL(url);
    const body = pathname.endsWith("/release") ? { releases: [{ ...release, "track-count": 2 }] }
      : pathname.endsWith("/release/rel-marrow") ? release
      : pathname.includes("/release-group/") ? { genres: [{ name: "hyperpop", count: 4 }, { name: "emo rap", count: 3 }] }
      : pathname.endsWith("/recording") ? { recordings: [] } : {};
    return { ok: true, status: 200, json: async () => body };
  };
  return { fetchImpl, coverRequests };
}

test("an album lookup matches every track to one release and downloads its cover once", async (t) => {
  const dir = tempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { fetchImpl, coverRequests } = fakeMusicBrainz();
  const lookup = createTaggingLookup({ client: createMusicBrainzClient({ userAgent: "t", fetchImpl, minIntervalMs: 0 }), coverDir: dir, userAgent: "t", fetchImpl });
  const songs = [
    { id: "a", title: "madeleine", artist: "brakence", album: "marroW", durationMs: 150500, filePath: "/m/marrow/1.mp3" },
    { id: "b", title: "death rolL", artist: "brakence", album: "marroW", durationMs: 199800, filePath: "/m/marrow/2.mp3" }
  ];
  const { proposals, missed } = await lookup.lookupGroup(songs);
  assert.deepEqual(missed, []);
  assert.deepEqual(proposals.map((proposal) => [proposal.songId, proposal.ids.recordingId, proposal.ids.releaseTrackId, proposal.tags.trackNumber]), [["a", "rec-1", "t1", 1], ["b", "rec-2", "t2", 2]]);
  assert.equal(proposals[0].tags.genre, "Hyperpop; Emo Rap");
  assert.equal(proposals[0].coverPath, path.join(dir, "rel-marrow.jpg"));
  assert.ok(fs.readFileSync(proposals[0].coverPath).equals(JPEG));
  assert.equal(coverRequests.length, 1, "the cover is downloaded once per release");
});

test("an unreachable MusicBrainz is an error, not \"no match\"", async (t) => {
  const dir = tempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const fetchImpl = async () => { throw new TypeError("fetch failed"); };
  const lookup = createTaggingLookup({ client: createMusicBrainzClient({ userAgent: "t", fetchImpl, minIntervalMs: 0 }), coverDir: dir, userAgent: "t", fetchImpl });
  await assert.rejects(lookup.lookupGroup([{ id: "s", title: "Song", artist: "Artist", album: "local files", filePath: "/d/s.mp3" }]), /Couldn't reach MusicBrainz/);
  await assert.rejects(lookup.lookupGroup([
    { id: "a", title: "One", artist: "Artist", album: "Album", filePath: "/m/a/1.mp3" },
    { id: "b", title: "Two", artist: "Artist", album: "Album", filePath: "/m/a/2.mp3" }
  ]), /Couldn't reach MusicBrainz/);
});

test("withMusicBrainzUfid adds the recording ID where Picard and music-metadata expect it", async () => {
  const frame = (id, text) => { const body = Buffer.concat([Buffer.from([3]), Buffer.from(text)]); return Buffer.concat([Buffer.from(id), Buffer.from([0, 0, 0, body.length, 0, 0]), body]); };
  const frames = frame("TIT2", "Song");
  const tag = Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, frames.length + 16]), frames, Buffer.alloc(16)]);
  const audio = Buffer.from([0xff, 0xfb, 0x90, 0x64]);
  const tagged = withMusicBrainzUfid(withMusicBrainzUfid(Buffer.concat([tag, audio]), "old-id"), "rec-123");
  const { common, native } = await parseBuffer(tagged, { mimeType: "audio/mpeg" }, { duration: false });
  assert.equal(common.title, "Song");
  assert.equal(common.musicbrainz_recordingid, "rec-123");
  assert.equal(native["ID3v2.4"].filter((item) => item.id === "UFID").length, 1, "an older MusicBrainz UFID is replaced");
  assert.ok(tagged.subarray(-4).equals(audio));
});

test("ffmpegArgs copies audio, keeps old tags and never re-encodes", () => {
  const ids = { recordingId: "r", releaseTrackId: "t", releaseId: "rel", releaseGroupId: "rg", artistIds: ["a1", "a2"], albumArtistIds: ["a1"] };
  const tags = { title: "T", artist: "A", album: "Al", albumArtist: "A", date: "2020", genre: "Pop", trackNumber: 3, trackTotal: 10, discNumber: 1, discTotal: 1, releaseType: "album", releaseStatus: "official", releaseCountry: "US" };
  const mp3 = ffmpegArgs({ input: "/m/a.mp3", output: "/m/.a.tmp.mp3", cover: "/c.jpg", tags, ids });
  assert.ok(mp3.join(" ").includes("-c copy -map_metadata 0"));
  assert.ok(mp3.includes("track=3/10") && mp3.includes("MusicBrainz Album Id=rel") && mp3.includes("MusicBrainz Artist Id=a1/a2"));
  assert.ok(mp3.includes("attached_pic"));
  const flac = ffmpegArgs({ input: "/m/a.flac", output: "/m/.a.tmp.flac", cover: "", tags, ids });
  assert.ok(flac.includes("MUSICBRAINZ_TRACKID=r") && flac.includes("track=3") && flac.includes("TRACKTOTAL=10"));
  assert.ok(flac.includes("0:v?"), "an existing cover is kept when there is no new one");
});

const ffmpegPath = String(require("ffmpeg-static") || "");
const hasFfmpeg = ffmpegPath && fs.existsSync(ffmpegPath);

test("writeMusicBrainzTags tags a real MP3 and FLAC, keeps the audio and sends the original to the Trash", { skip: !hasFfmpeg && "ffmpeg-static binary not installed" }, async (t) => {
  const dir = tempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const cover = path.join(dir, "cover.jpg");
  spawnSync(ffmpegPath, ["-v", "error", "-f", "lavfi", "-i", "color=c=red:s=64x64", "-frames:v", "1", cover]);
  const ids = { recordingId: "11111111-2222-3333-4444-555555555555", releaseTrackId: "t", releaseId: "rel", releaseGroupId: "rg", artistIds: ["a"], albumArtistIds: ["a"] };
  const tags = { title: "Proper Title", artist: "Proper Artist", album: "Proper Album", albumArtist: "Proper Artist", date: "2020-05-01", genre: "Pop", trackNumber: 2, trackTotal: 9, discNumber: 1, discTotal: 1, releaseType: "album", releaseStatus: "official", releaseCountry: "US" };
  for (const ext of [".mp3", ".flac"]) {
    const file = path.join(dir, `tone${ext}`);
    spawnSync(ffmpegPath, ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-metadata", "title=old title", "-metadata", "comment=keep me", file]);
    const audioBefore = spawnSync(ffmpegPath, ["-v", "error", "-i", file, "-map", "0:a", "-c", "copy", "-f", "md5", "-"]).stdout.toString();
    const trashed = [];
    await writeMusicBrainzTags({ filePath: file, tags, ids, cover, ffmpegPath, parseFile, trashItem: async (target) => { const moved = path.join(dir, `trashed${ext}`); fs.renameSync(target, moved); trashed.push(moved); } });
    const { common, native } = await parseFile(file);
    assert.equal(common.title, "Proper Title");
    assert.equal(common.album, "Proper Album");
    assert.equal(common.musicbrainz_recordingid, ids.recordingId);
    assert.equal(common.musicbrainz_albumid, "rel");
    assert.equal(common.track.no, 2);
    assert.equal(common.picture?.length, 1);
    assert.ok(Object.values(native).flat().some((item) => item.value === "keep me"), "existing tags are kept");
    assert.equal(spawnSync(ffmpegPath, ["-v", "error", "-i", file, "-map", "0:a", "-c", "copy", "-f", "md5", "-"]).stdout.toString(), audioBefore);
    assert.equal(trashed.length, 1);
    assert.deepEqual(fs.readdirSync(dir).filter((name) => name.startsWith(".")), [], "no temp file is left behind");
  }
});

test("a failed write leaves the original untouched and out of the Trash", { skip: !hasFfmpeg && "ffmpeg-static binary not installed" }, async (t) => {
  const dir = tempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "broken.mp3");
  fs.writeFileSync(file, "not audio");
  let trashed = false;
  await assert.rejects(writeMusicBrainzTags({ filePath: file, tags: { title: "x" }, ids: { recordingId: "r", artistIds: [], albumArtistIds: [] }, ffmpegPath, parseFile, trashItem: async () => { trashed = true; } }));
  assert.equal(trashed, false);
  assert.equal(fs.readFileSync(file, "utf8"), "not audio");
  assert.deepEqual(fs.readdirSync(dir), ["broken.mp3"]);
});

function fakeRouter() {
  const handlers = new Map();
  return { handle: (channel, handler) => handlers.set(channel, handler), invoke: (channel, payload) => handlers.get(channel)({}, payload) };
}

test("IPC: gated by the setting, proposals stay native, and library-only apply uses the local cover", async (t) => {
  const dir = tempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const files = ["1.mp3", "2.mp3"].map((name) => { const file = path.join(dir, name); fs.writeFileSync(file, "x"); return file; });
  const songs = new Map([
    ["a", { id: "a", title: "madeleine", artist: "brakence", album: "marroW", genre: "", durationMs: 150000, filePath: files[0] }],
    ["b", { id: "b", title: "death rolL", artist: "brakence", album: "marroW", genre: "", durationMs: 200000, filePath: files[1] }]
  ]);
  const settings = { musicbrainzTagging: false, musicbrainzWriteFiles: false };
  const sent = [];
  const router = fakeRouter();
  registerTaggingIpc(router, {
    app: { getVersion: () => "1.0.0", getPath: () => dir },
    songs: { get: (id) => songs.get(id), list: () => [...songs.values()], patch: (id, patch) => songs.set(id, { ...songs.get(id), ...patch }) },
    getSettings: () => settings,
    readLocalAudioMetadata: async () => ({}),
    listSongsShaped: () => [...songs.values()],
    safeMediaUrl: (file) => `localtify-media://${path.basename(file)}`,
    getWindow: () => ({ isDestroyed: () => false, webContents: { send: (channel, payload) => sent.push([channel, payload]) } }),
    fetchImpl: fakeMusicBrainz().fetchImpl,
    clientOptions: { minIntervalMs: 0 },
    parseFile: async () => ({ common: {} }),
    shell: { trashItem: async () => { throw new Error("must not trash when only the library is updated"); } },
    ffmpegPath: "/nonexistent"
  });

  await assert.rejects(router.invoke("tagging:lookup", { songIds: ["a"] }), /Turn on/);
  settings.musicbrainzTagging = true;
  const { proposals } = await router.invoke("tagging:lookup", { songIds: ["a", "b", "../../etc/passwd"] });
  assert.equal(proposals.length, 2);
  assert.equal(proposals[0].coverUrl, "localtify-media://rel-marrow.jpg", "the preview cover is the downloaded local file");

  const pending = await router.invoke("tagging:pending");
  assert.deepEqual(pending.map((proposal) => proposal.songId), ["a", "b"], "finished lookups survive the panel closing");
  assert.equal(pending[0].groupKey, `marrow\0${dir}`);

  const result = await router.invoke("tagging:apply", { songIds: ["a", "unknown"] });
  assert.deepEqual(result, { applied: 1, written: 0, failed: [] });
  assert.equal(songs.get("a").genre, "Hyperpop; Emo Rap");
  assert.equal(songs.get("a").coverPath, path.join(dir, "musicbrainz-covers", "rel-marrow.jpg"));
  assert.equal(songs.get("a").coverSource, "custom");
  assert.equal(songs.get("b").genre, "", "unselected songs are untouched");
  assert.equal(sent[0][0], "library:watched-change");
  assert.deepEqual(await router.invoke("tagging:apply", { songIds: ["a"] }), { applied: 0, written: 0, failed: [] }, "a proposal is used once");
});

test("main registers tagging IPC and Experimental settings shows the panel", () => {
  assert.match(fs.readFileSync(path.join(root, "electron", "main.cjs"), "utf8"), /registerTaggingIpc\(ipcRouter/);
  assert.match(fs.readFileSync(path.join(root, "src", "features", "settings", "categories", "ExperimentalSettings.tsx"), "utf8"), /<TaggingSettings /);
});
