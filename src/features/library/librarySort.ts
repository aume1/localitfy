import type { Song } from "./song.types";

export type LibrarySortMode = "library" | "artist";

const librarySortCollator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

// Sorting is a view over the saved library order; it never rewrites that order.
export function sortLibrarySongs<T extends Pick<Song, "artist" | "album" | "title">>(list: T[], mode: LibrarySortMode): T[] {
  if (mode !== "artist") return list;
  return [...list].sort((a, b) =>
    librarySortCollator.compare(String(a.artist || "unknown artist"), String(b.artist || "unknown artist"))
    || librarySortCollator.compare(String(a.album || ""), String(b.album || ""))
    || librarySortCollator.compare(String(a.title || ""), String(b.title || ""))
  );
}

export function topPlayedSongs<T extends Pick<Song, "playCount">>(songs: readonly T[], limit = 6): T[] {
  const count = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  if (!count) return [];
  const best: T[] = [];
  for (const song of songs) {
    const plays = song.playCount || 0;
    if (best.length === count && plays <= (best[count - 1].playCount || 0)) continue;
    let index = 0;
    while (index < best.length && (best[index].playCount || 0) >= plays) index += 1;
    if (index >= count) continue;
    best.splice(index, 0, song);
    if (best.length > count) best.pop();
  }
  return best;
}
