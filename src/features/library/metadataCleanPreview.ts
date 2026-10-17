import { getMetadataRepairPatch } from "../search";
import type { MetadataCleanPreview, Song } from "./song.types";

/** Prepare a read-only preview; callers decide whether to commit edits. */
export function createMetadataCleanPreview(songs: Song[], coverSelectedSongIds: string[], scope: "all" | "selected" = "all"): MetadataCleanPreview {
    const selectedIds = new Set(coverSelectedSongIds);
    const targetSongs = scope === "selected" && selectedIds.size
      ? songs.filter((song) => selectedIds.has(song.id))
      : songs;

    const items = targetSongs.map((song) => {
      const repair = getMetadataRepairPatch(song);
      const patch: Partial<Pick<Song, "title" | "artist" | "album">> = {};
      if (typeof repair.title === "string" && repair.title !== song.title) patch.title = repair.title;
      if (typeof repair.artist === "string" && repair.artist !== song.artist) patch.artist = repair.artist;
      if (typeof repair.album === "string" && repair.album !== song.album) patch.album = repair.album;
      const fields = Object.keys(patch);

      return {
        id: song.id,
        before: {
          title: song.title,
          artist: song.artist,
          album: song.album
        },
        after: {
          title: patch.title ?? song.title,
          artist: patch.artist ?? song.artist,
          album: patch.album ?? song.album
        },
        patch,
        fields
      };
    });

    const changedItems = items.filter((item) => Object.keys(item.patch).length > 0);
    const titleFixCount = changedItems.filter((item) => Object.prototype.hasOwnProperty.call(item.patch, "title")).length;
    const artistFixCount = changedItems.filter((item) => Object.prototype.hasOwnProperty.call(item.patch, "artist")).length;
    const albumFixCount = changedItems.filter((item) => Object.prototype.hasOwnProperty.call(item.patch, "album")).length;

    return {
      id: Date.now(),
      scope,
      totalCount: targetSongs.length,
      changedCount: changedItems.length,
      skippedCount: Math.max(0, targetSongs.length - changedItems.length),
      titleFixCount,
      artistFixCount,
      albumFixCount,
      items: changedItems
    };
  }
