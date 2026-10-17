import { isPlayableSong } from "../library/library.utils";
import type { Song } from "../library/song.types";

/** Shuffle the playable, unique songs without changing the saved library order. */
export function getShuffleRandomIndex(maxExclusive: number) {
    const safeMax = Math.max(0, Math.floor(maxExclusive));

    if (safeMax <= 1) return 0;

    try {
      const values = new Uint32Array(1);
      window.crypto?.getRandomValues(values);
      return values[0] % safeMax;
    } catch {
      return Math.floor(Math.random() * safeMax);
    }
  }

export function makeShuffledPlayableSongs(sourceSongs: Song[], avoidFirstSongId = "") {
    const seenSongIds = new Set<string>();
    const shuffled = sourceSongs.filter(isPlayableSong).filter((song) => {
      if (seenSongIds.has(song.id)) return false;
      seenSongIds.add(song.id);
      return true;
    });

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = getShuffleRandomIndex(index + 1);
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }

    if (avoidFirstSongId && shuffled.length > 1 && shuffled[0]?.id === avoidFirstSongId) {
      const swapIndex = shuffled.findIndex((song, index) => index > 0 && song.id !== avoidFirstSongId);
      if (swapIndex > 0) {
        [shuffled[0], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[0]];
      }
    }

    return shuffled;
  }
