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
