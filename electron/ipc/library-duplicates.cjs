"use strict";

const fs = require("node:fs");
const { findDuplicates, validateMerges } = require("../library-duplicates.cjs");
const { readNormalizedVector } = require("../analysis/similarity.cjs");
const { MODEL, ANALYZER_VERSION } = require("../analysis/model.cjs");

/** Duplicate review: scanning is read-only; merging re-checks the plan against a fresh scan and backs up first. */
function registerDuplicateIpc(router, deps) {
  const { shell, getSongs, getAudioProfiles, mergeDuplicates, backupDatabase, clearFileInfoCache, listSongsShaped } = deps;

  async function scan() {
    const songs = getSongs();
    const fileSizes = new Map();
    await Promise.all(songs.map(async (song) => {
      try { const stat = await fs.promises.stat(song.filePath); if (stat.isFile()) fileSizes.set(song.id, stat.size); } catch { /* missing files are skipped */ }
    }));
    const vectors = new Map();
    for (const row of getAudioProfiles(MODEL.id, ANALYZER_VERSION)) {
      const vector = readNormalizedVector(row.vector);
      if (vector) vectors.set(row.songId, vector);
    }
    const present = songs.filter((song) => fileSizes.has(song.id));
    return { songs, sets: findDuplicates(present, { vectors, fileSizes }), scanned: present.length, analyzed: vectors.size };
  }

  router.handle("library:find-duplicates", async () => {
    try {
      const { sets, scanned, analyzed } = await scan();
      return { ok: true, sets, scanned, analyzed };
    } catch (error) {
      console.log("[localitfy duplicate scan error]", error?.message || error);
      return { ok: false, message: "Could not scan for duplicates. Please retry." };
    }
  });

  router.handle("library:merge-duplicates", async (_event, payload = {}) => {
    try {
      const { songs, sets } = await scan();
      const merges = validateMerges(payload?.merges, sets);
      const paths = new Map(songs.map((song) => [song.id, song.filePath]));
      // Fail closed: no backup, no merge.
      backupDatabase("before-duplicate-merge");
      const removed = mergeDuplicates(merges);
      clearFileInfoCache();
      let trashed = 0; let trashFailed = 0;
      if (payload?.moveToTrash === true) {
        for (const id of removed) {
          try { await shell.trashItem(paths.get(id)); trashed += 1; } catch { trashFailed += 1; }
        }
      }
      return { ok: true, removedCount: removed.length, trashed, trashFailed, merges, songs: listSongsShaped() };
    } catch (error) {
      console.log("[localitfy duplicate merge error]", error?.message || error);
      return { ok: false, message: error?.message || "Could not merge duplicates. Nothing was changed." };
    }
  });
}

module.exports = { registerDuplicateIpc };
