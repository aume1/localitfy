const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { filePathKey } = require("./path-identity.cjs");
const { normalizeForLooseMatch, matchSpotifyTrackForFile } = require("./download-imports.cjs");
const { readLocalAudioMetadata, guardMetadataRepairPatch } = require("../metadata-service.cjs");
const { resolveSongCover, createLeastUsedCoverAllocator } = require("../cover-service.cjs");

function createLibraryImportRuntime({getSongs, getSong, insertSongs, patchSong, clearFileInfoCache, getFileInfoCached, getPixelArtFiles, isAudioFile, isImageFile, fileExists, isDownloadFileInProgress, cacheSpotifyCoverImage, safeMediaUrl, getCoverThumbnailUrl}) {
  // All files in one import share cover usage. Avoid a full SQLite library
  // read for every track when assigning fallback artwork.
  const importCoverAllocators = new WeakMap();
  async function makeSongFromFile(filePath, pixelArtFiles = [], usedCovers = new Set(), options = {}) {
    const parsed = path.parse(filePath);
    const parts = parsed.name.split(" - ").map((item) => item.trim());
    let artist = "";
    let title = parsed.name;
    if (parts.length >= 2) {
      artist = parts[0];
      title = parts.slice(1).join(" - ");
    }
    const id = crypto.createHash("sha256").update(filePath).digest("hex");
    const metadata = await readLocalAudioMetadata(filePath);
    title = String(metadata?.title || title || parsed.name || "untitled").trim();
    artist = String(metadata?.artist || artist || "unknown artist").trim();
    const album = String(metadata?.album || options.album || "").trim();
    const genre = String(metadata?.genre || options.genre || "").trim();
    let fallbackCover = "";
    let importAllocator = null;
    if (pixelArtFiles.length) {
      importAllocator = importCoverAllocators.get(usedCovers);
      if (!importAllocator) {
        importAllocator = createLeastUsedCoverAllocator(pixelArtFiles, getSongs());
        importCoverAllocators.set(usedCovers, importAllocator);
      }
      fallbackCover = importAllocator.choose();
    }
    const coverResult = await resolveSongCover({
      song: { id, title, artist, album, filePath, coverPath: options.coverPath || "", coverSource: options.coverSource || "" },
      metadata,
      filePath,
      folderCoverPath: options.folderCoverPath || "",
      preferFolderCover: Boolean(options.preferFolderCover),
      albumEmbeddedCoverPath: options.albumEmbeddedCoverPath || options.albumCoverPath || "",
      spotifyCoverPath: options.spotifyCoverPath || "",
      fallbackCoverPath: fallbackCover
    });
    if (coverResult.coverSource === "fallback" && coverResult.coverPath) {
      usedCovers.add(coverResult.coverPath);
      importAllocator?.record("", coverResult.coverPath);
    }
    const durationMs = Math.max(0, Number(metadata?.durationMs || options.durationMs || 0));
    const duration = Math.max(0, Number(metadata?.duration || Math.round(durationMs / 1000) || options.duration || 0));
    return { id, title, artist, album, genre, filePath, coverPath: coverResult.coverPath || "", coverSource: coverResult.coverSource || "none", coverUpdatedAt: coverResult.coverUpdatedAt || new Date().toISOString(), duration, durationMs: durationMs || (duration > 0 ? duration * 1000 : 0), track: Number(metadata?.track || 0) || 0, disc: Number(metadata?.disc || 0) || 0, year: metadata?.year || "", bitrate: 0, addedAt: Date.now() };
  }

  function listAudioFilesInDirectory(directory, options = {}) {
    const root = String(directory || "");
    const maxDepth = Number.isFinite(Number(options.maxDepth)) ? Number(options.maxDepth) : 2;
    const maxFiles = Number.isFinite(Number(options.maxFiles)) ? Number(options.maxFiles) : 1500;
    const out = [];
    if (!root || !path.isAbsolute(root) || !fs.existsSync(root)) return out;
    const walk = (dir, depth) => {
      if (out.length >= maxFiles || depth > maxDepth) return;
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (out.length >= maxFiles) break;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name.startsWith(".") || entry.name === "localitfy-bin" || entry.name === "spotify-covers") continue;
          walk(fullPath, depth + 1);
          continue;
        }
        if (!entry.isFile() || !isAudioFile(fullPath) || isDownloadFileInProgress(fullPath) || /\.(part|tmp|download|crdownload)$/i.test(entry.name)) continue;
        out.push(fullPath);
      }
    };
    walk(root, 0);
    out.sort((a, b) => (getFileInfoCached(b).mtimeMs || 0) - (getFileInfoCached(a).mtimeMs || 0));
    return out;
  }

  async function makeSongFromFileWithMetadata(filePath, tracks = [], pixelArtFiles = [], usedCovers = new Set()) {
    const baseSong = await makeSongFromFile(filePath, pixelArtFiles, usedCovers);
    const matched = matchSpotifyTrackForFile(filePath, tracks);
    if (!matched) return baseSong;
    const title = String(matched?.title || matched?.name || baseSong.title || "").trim();
    const artist = String(matched?.artist || matched?.artists || baseSong.artist || "").trim();
    const album = String(matched?.albumName || matched?.album || baseSong.album || "").trim();
    const coverUrl = String(matched?.coverUrl || matched?.spotifyCoverUrl || matched?.albumCoverUrl || "").trim();
    const cachedCoverPath = await cacheSpotifyCoverImage(coverUrl, matched?.id || title || filePath);
    const useSpotifyCover = cachedCoverPath && (!baseSong.coverPath || baseSong.coverSource === "fallback" || baseSong.coverSource === "none");
    return { ...baseSong, title: title || baseSong.title, artist: artist || baseSong.artist, album: album || baseSong.album || "", coverPath: useSpotifyCover ? cachedCoverPath : baseSong.coverPath, coverSource: useSpotifyCover ? "spotify" : baseSong.coverSource, coverUpdatedAt: useSpotifyCover ? new Date().toISOString() : baseSong.coverUpdatedAt, duration: Number(matched?.duration || Math.round(Number(matched?.durationMs || 0) / 1000) || baseSong.duration || 0), durationMs: Number(matched?.durationMs || baseSong.durationMs || 0) || 0 };
  }

  async function makeSongFromFileWithExactSpotifyTrack(filePath, track = {}, pixelArtFiles = [], usedCovers = new Set(), sourceInfo = {}) {
    const baseSong = await makeSongFromFile(filePath, pixelArtFiles, usedCovers);
    const title = String(track?.title || track?.name || "").trim();
    // Public Spotify pages can leave out the artist: then use who posted the matched video, never the "spotify_<id>" file prefix.
    const matchedArtist = String(sourceInfo?.matchedArtist || "").replace(/\s+-\s+topic$|\s*vevo$/i, "").trim();
    const artist = String(track?.artist || track?.artists || "").trim() || matchedArtist || (/^spotify_/i.test(baseSong.artist) ? "unknown artist" : "");
    const album = String(track?.albumName || track?.album || "").trim();
    const coverUrl = String(track?.coverUrl || track?.spotifyCoverUrl || track?.albumCoverUrl || "").trim();
    const duration = Number(track?.duration || Math.round(Number(track?.durationMs || 0) / 1000) || baseSong.duration || 0);
    const spotifyTrackId = String(sourceInfo?.sourceTrackId || track?.sourceTrackId || track?.spotifyTrackId || track?.id || "").trim();
    const spotifyUrl = String(sourceInfo?.sourceUrl || track?.sourceUrl || track?.spotifyUrl || (spotifyTrackId ? `https://open.spotify.com/track/${spotifyTrackId}` : "")).trim();
    const cachedCoverPath = await cacheSpotifyCoverImage(coverUrl, spotifyTrackId || track?.id || title || filePath);
    const useSpotifyCover = cachedCoverPath && (!baseSong.coverPath || baseSong.coverSource === "fallback" || baseSong.coverSource === "none");
    return { ...baseSong, title: title || baseSong.title, artist: artist || baseSong.artist, album: album || baseSong.album || "", coverPath: useSpotifyCover ? cachedCoverPath : baseSong.coverPath, coverSource: useSpotifyCover ? "spotify" : baseSong.coverSource, coverUpdatedAt: useSpotifyCover ? new Date().toISOString() : baseSong.coverUpdatedAt, duration, durationMs: Number(track?.durationMs || duration * 1000 || baseSong.durationMs || 0) || 0, sourceType: require("../discover/track-identity.cjs").selectedYouTubeId(spotifyTrackId) ? "youtube" : "spotify", sourceTrackId: spotifyTrackId, sourceUrl: spotifyUrl, sourceProvider: String(sourceInfo?.sourceProvider || sourceInfo?.provider || "youtube"), sourceProviderUrl: String(sourceInfo?.sourceProviderUrl || sourceInfo?.providerUrl || ""), sourceMatchScore: Number(sourceInfo?.sourceMatchScore ?? sourceInfo?.matchScore ?? 0) || 0 };
  }

  async function importNewAudioFilesFromDirectory(directory, tracks = [], options = {}) {
    const includeSongs = options.includeSongs !== false;
    const shapeResult = () => includeSongs ? listSongsShaped() : undefined;
    const result = await importNewAudioFiles(listAudioFilesInDirectory(directory, options), tracks);
    if (result.importedCount) console.log("[localtify library refresh] imported new audio files from folder", { folder: directory, changedCount: result.changedCount });
    return { ...result, songs: shapeResult() };
  }
  async function importNewAudioFiles(audioFiles, tracks = []) {
    const existingPaths = new Set(getSongs().map((song) => filePathKey(String(song.filePath || ""))).filter(Boolean));
    const newFiles = audioFiles.filter((filePath) => {
      if (isDownloadFileInProgress(filePath)) return false;
      const key = filePathKey(String(filePath || ""));
      if (!key || existingPaths.has(key)) return false;
      existingPaths.add(key);
      return true;
    });
    if (!newFiles.length) return { changedCount: 0, importedCount: 0, files: [] };
    const pixelArtFiles = getPixelArtFiles();
    const usedCovers = new Set();
    const importedSongs = [];
    for (const filePath of newFiles) importedSongs.push(await makeSongFromFileWithMetadata(filePath, tracks, pixelArtFiles, usedCovers));
    const changedCount = insertSongs(importedSongs);
    clearFileInfoCache();
    return { changedCount, importedCount: importedSongs.length, files: newFiles };
  }

  async function repairSpotifyMetadataForFolder(directory, tracks = [], options = {}) {
    const audioFiles = listAudioFilesInDirectory(directory, options);
    if (!audioFiles.length || !Array.isArray(tracks) || !tracks.length) return { changedCount: 0, songs: listSongsShaped() };
    const songs = getSongs();
    const byPath = new Map(songs.filter((song) => song?.filePath).map((song) => [filePathKey(String(song.filePath)), song]));
    let changedCount = 0;
    for (const filePath of audioFiles) {
      const key = filePathKey(String(filePath || ""));
      const song = byPath.get(key);
      if (!song) continue;
      const matched = matchSpotifyTrackForFile(filePath, tracks);
      if (!matched) continue;
      const title = String(matched?.title || matched?.name || "").trim();
      const artist = String(matched?.artist || matched?.artists || "").trim();
      const album = String(matched?.albumName || matched?.album || "").trim();
      const coverUrl = String(matched?.coverUrl || matched?.spotifyCoverUrl || matched?.albumCoverUrl || "").trim();
      const cachedCoverPath = await cacheSpotifyCoverImage(coverUrl, matched?.id || title || filePath);
      const patch = {};
      const currentArtist = String(song.artist || "").trim().toLowerCase();
      const currentTitle = String(song.title || "").trim().toLowerCase();
      const currentCover = String(song.coverPath || "").trim();
      if (title && (!song.title || currentTitle === "unknown title" || currentTitle === normalizeForLooseMatch(path.parse(filePath).name))) patch.title = title;
      if (artist && (!song.artist || currentArtist === "unknown artist" || currentArtist === "unknown" || currentArtist === "slowed" || currentArtist === "slow" || currentArtist === "reverb" || currentArtist === "nightcore" || currentArtist === "sped up")) patch.artist = artist;
      if (album && (!song.album || String(song.album).trim().toLowerCase() === "unknown album")) patch.album = album;
      if (cachedCoverPath) {
        const normalizedCover = currentCover.replace(/\\/g, "/").toLowerCase();
        const isPixelFallback = normalizedCover.includes("/pixelart/");
        if (song.coverSource !== "custom" && (!currentCover || !fileExists(currentCover) || isPixelFallback || song.coverSource === "fallback" || song.coverSource === "none")) {
          patch.coverPath = cachedCoverPath;
          patch.coverSource = "spotify";
          patch.coverUpdatedAt = new Date().toISOString();
        }
      }
      const duration = Number(matched?.duration || Math.round(Number(matched?.durationMs || 0) / 1000) || 0);
      if (duration > 0 && !Number(song.duration || 0)) patch.duration = duration;
      if (Object.keys(patch).length) {
        try {
          const guarded = guardMetadataRepairPatch(song, getSong(song.id), patch);
          if (Object.keys(guarded).length && patchSong(song.id, guarded)) changedCount += 1;
        } catch (error) { console.log("[localitfy spotify metadata repair error]", error?.message || error); }
      }
    }
    if (changedCount) clearFileInfoCache();
    console.log("[localtify spotify metadata repair]", { folder: directory, checked: audioFiles.length, repaired: changedCount });
    return { changedCount, songs: listSongsShaped() };
  }

  function pickStablePixelCoverForSong(song, pixelArtFiles = null) {
    const covers = Array.isArray(pixelArtFiles) ? pixelArtFiles : getPixelArtFiles();
    if (!covers.length) return "";
    const seed = [song?.id, song?.title, song?.artist, song?.album, song?.filePath].filter(Boolean).join("::");
    try {
      const digest = crypto.createHash("sha1").update(seed || "localtify-cover").digest();
      return covers[digest.readUInt32BE(0) % covers.length] || "";
    } catch { return covers[0] || ""; }
  }
  function getRuntimeCoverPath(song, pixelArtFiles = null) {
    const savedCoverPath = String(song?.coverPath || "").trim();
    if (savedCoverPath && fileExists(savedCoverPath) && isImageFile(savedCoverPath)) return savedCoverPath;
    return pickStablePixelCoverForSong(song, pixelArtFiles);
  }
  function shapeSong(song, pixelArtFiles = null, artworkCache = null) {
    if (!song) return null;
    const exists = fileExists(song.filePath);
    const savedCoverPath = String(song.coverPath || "").trim();
    const savedCoverExists = Boolean(savedCoverPath && isImageFile(savedCoverPath) && fileExists(savedCoverPath));
    const runtimeCoverPath = savedCoverExists ? savedCoverPath : pickStablePixelCoverForSong(song, pixelArtFiles);
    const coverExists = savedCoverExists || Boolean(runtimeCoverPath && fileExists(runtimeCoverPath));
    const runtimeCoverSource = savedCoverExists ? String(song.coverSource || "unknown") : (runtimeCoverPath ? "fallback" : "none");
    let artwork = coverExists ? artworkCache?.get(runtimeCoverPath) : null;
    if (!artwork) {
      artwork = { coverUrl: coverExists ? safeMediaUrl(runtimeCoverPath) : "",
        coverThumbUrl: coverExists ? getCoverThumbnailUrl(runtimeCoverPath, !artworkCache) : "" };
      if (artworkCache && coverExists && artworkCache.size < 2048) artworkCache.set(runtimeCoverPath, artwork);
    }
    const { coverUrl, coverThumbUrl } = artwork;
    return { ...song, url: "", coverPath: savedCoverPath || runtimeCoverPath || "", coverSource: runtimeCoverSource, coverUpdatedAt: song.coverUpdatedAt || null, durationMs: Number(song.durationMs || (Number(song.duration || 0) * 1000) || 0), savedCoverPath, savedCoverExists, usesFallbackCover: runtimeCoverSource === "fallback" || !savedCoverExists, missingSavedCover: !savedCoverPath || (Boolean(savedCoverPath) && !savedCoverExists), coverUrl, coverThumbUrl, coverThumbnailUrl: coverThumbUrl, thumbnailUrl: coverThumbUrl, coverFullUrl: coverUrl, exists, fileExists: exists, coverExists, coverThumbnailReady: Boolean(coverThumbUrl) };
  }
  function listSongsShaped() {
    const pixelArtFiles = getPixelArtFiles();
    const artworkCache = new Map();
    return getSongs().map((song) => shapeSong(song, pixelArtFiles, artworkCache));
  }
  async function repairMissingSongMetadata(payload = {}) {
    const limit = Math.max(1, Math.min(1000, Number(payload?.limit || 180) || 180));
    const force = Boolean(payload?.force || payload?.forceAll);
    const coverOnly = Boolean(payload?.coverOnly);
    const durationOnly = Boolean(payload?.durationOnly);
    const allSongs = getSongs();
    const pixelArtFiles = getPixelArtFiles();
    const targets = [];
    for (const song of allSongs) {
      if (!song?.filePath || !isAudioFile(song.filePath)) continue;
      const durationMissing = Number(song.duration || 0) <= 0 || Number(song.durationMs || 0) <= 0;
      const coverMissing = !durationOnly && (!song.coverPath || !song.coverSource || ["fallback", "none", "unknown"].includes(song.coverSource) || !fileExists(song.coverPath));
      if (!(force || (coverOnly ? coverMissing : durationOnly ? durationMissing : durationMissing || coverMissing))) continue;
      if (!fileExists(song.filePath)) continue;
      targets.push(song);
      if (targets.length >= limit) break;
    }

    let changedCount = 0;
    let durationFixedCount = 0;
    let coverFixedCount = 0;
    const changedIds = [];
    for (const song of targets) {
      const before = await fs.promises.stat(song.filePath).catch(() => null);
      if (!before?.isFile() || getSong(song.id)?.filePath !== song.filePath) continue;
      const metadata = await readLocalAudioMetadata(song.filePath, { readCover: !durationOnly, readDuration: !coverOnly });
      const coverResult = durationOnly ? {} : await resolveSongCover({
        song, metadata, filePath: song.filePath, fallbackCoverPath: pickStablePixelCoverForSong(song, pixelArtFiles)
      });
      const patch = {};
      const title = String(metadata?.title || "").trim();
      const artist = String(metadata?.artist || "").trim();
      const album = String(metadata?.album || "").trim();
      const genre = String(metadata?.genre || "").trim();
      if (!durationOnly) {
        if (title && (!song.title || song.title === path.parse(song.filePath).name)) patch.title = title;
        if (artist && (!song.artist || song.artist === "unknown artist")) patch.artist = artist;
        if (album && (!song.album || song.album === "local files")) patch.album = album;
        if (genre && (force || !song.genre)) patch.genre = genre;
      }
      const metadataDurationMs = Math.max(0, Number(metadata?.durationMs || 0), Number(metadata?.duration || 0) > 0 ? Number(metadata.duration) * 1000 : 0);
      if (!coverOnly && metadataDurationMs > 0 && (force || Number(song.duration || 0) <= 0 || Number(song.durationMs || 0) <= 0)) {
        patch.durationMs = metadataDurationMs;
        patch.duration = Math.round(metadataDurationMs / 1000);
      }
      if (!durationOnly && coverResult.coverPath && (force || !song.coverPath || !fileExists(song.coverPath) || song.coverSource !== "custom" && ["fallback", "none", "unknown", ""].includes(String(song.coverSource || "")))) {
        patch.coverPath = coverResult.coverPath;
        patch.coverSource = coverResult.coverSource;
        patch.coverUpdatedAt = coverResult.coverUpdatedAt;
      }
      if (Object.keys(patch).length) {
        const after = await fs.promises.stat(song.filePath).catch(() => null);
        if (!after?.isFile() || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) continue;
        const guarded = guardMetadataRepairPatch(song, getSong(song.id), patch);
        if (!Object.keys(guarded).length || !patchSong(song.id, guarded)) continue;
        changedCount += 1;
        if (Object.prototype.hasOwnProperty.call(guarded, "duration") || Object.prototype.hasOwnProperty.call(guarded, "durationMs")) durationFixedCount += 1;
        if (Object.prototype.hasOwnProperty.call(guarded, "coverPath")) coverFixedCount += 1;
        changedIds.push(song.id);
      }
    }
    clearFileInfoCache();
    return { ok: true, scannedCount: targets.length, changedCount, durationFixedCount, coverFixedCount, changedIds, songs: listSongsShaped() };
  }
  return {makeSongFromFile, listAudioFilesInDirectory, makeSongFromFileWithExactSpotifyTrack, importNewAudioFilesFromDirectory, importNewAudioFiles, repairSpotifyMetadataForFolder, pickStablePixelCoverForSong, getRuntimeCoverPath, shapeSong, listSongsShaped, repairMissingSongMetadata};
}
module.exports = {createLibraryImportRuntime};
