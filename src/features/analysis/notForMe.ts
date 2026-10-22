import { useCallback, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { splitArtistCredits } from "../artists/artistCredits";
import type { Song } from "../library/song.types";
import type { Settings } from "../settings/settings.types";

export type NotForMeKind = "song" | "artist";
export type NotForMeMarks = { songs: string[]; artists: string[] };

function strings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
const artistKey = (name: string) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase();

export function readNotForMe(settings: Pick<Settings, "notForMeSongs" | "notForMeArtists">): NotForMeMarks {
  return { songs: strings(settings.notForMeSongs), artists: strings(settings.notForMeArtists) };
}

export function hasArtistMark(marks: NotForMeMarks, name: string) {
  const key = artistKey(name);
  return marks.artists.some((artist) => artistKey(artist) === key);
}

/** Same test as notForMe in electron/analysis/listening-signals.cjs: the song is marked, or any credited artist is. */
export function notForMeTest(marks: NotForMeMarks) {
  const songs = new Set(marks.songs);
  const artists = new Set(marks.artists.map(artistKey));
  return (song: Song) => songs.has(song.id) || (artists.size > 0 && Boolean(song.artist?.trim())
    && splitArtistCredits(song.artist).some((name) => artists.has(artistKey(name))));
}

export function toggleNotForMe(marks: NotForMeMarks, kind: NotForMeKind, value: string): NotForMeMarks {
  if (kind === "song") {
    return { ...marks, songs: marks.songs.includes(value) ? marks.songs.filter((id) => id !== value) : [...marks.songs, value] };
  }
  const key = artistKey(value);
  return { ...marks, artists: hasArtistMark(marks, value) ? marks.artists.filter((artist) => artistKey(artist) !== key) : [...marks.artists, value.trim()] };
}

type NotForMeOptions = {
  settings: Settings;
  updateSettingsPatch: (patch: Partial<Settings>) => unknown;
  songsById: Map<string, Song>;
  setQueue: Dispatch<SetStateAction<string[]>>;
  radioSongIds: ReadonlySet<string>;
  announce: (text: string) => unknown;
};

/** Songs and artists marked "not for me" are left out of daily mixes, similar songs and song radio. */
export function useNotForMe({ settings, updateSettingsPatch, songsById, setQueue, radioSongIds, announce }: NotForMeOptions) {
  const marks = useMemo(() => readNotForMe(settings), [settings.notForMeSongs, settings.notForMeArtists]);
  const toggle = useCallback((kind: NotForMeKind, value: string) => {
    const next = toggleNotForMe(marks, kind, value);
    const marked = notForMeTest(next);
    // Upcoming radio picks that are now marked leave the queue; songs you queued yourself stay.
    setQueue((queue) => {
      const kept = queue.filter((id) => { const song = songsById.get(id); return !radioSongIds.has(id) || !song || !marked(song); });
      return kept.length === queue.length ? queue : kept;
    });
    void updateSettingsPatch({ notForMeSongs: next.songs, notForMeArtists: next.artists });
    const added = kind === "song" ? next.songs.length > marks.songs.length : next.artists.length > marks.artists.length;
    announce(added ? "not for me: left out of mixes, similar songs and radio" : "back in mixes, similar songs and radio");
  }, [marks, songsById, setQueue, radioSongIds, updateSettingsPatch, announce]);
  return { marks, toggle };
}
