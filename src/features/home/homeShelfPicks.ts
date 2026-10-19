import type { Song } from "../library/song.types";
import type { LocalAlbumEntry } from "../albums/album.types";

/** Pure picks for the Home shelves. Kept free of runtime imports so they are easy to test. */

const DAY_MS = 24 * 60 * 60 * 1000;
/** A favourite counts as forgotten once it has gone this long without a play. */
export const REDISCOVER_AFTER_DAYS = 30;
/** Plays a song needs before it can come back as a forgotten favourite. */
export const REDISCOVER_MIN_PLAYS = 3;

function playable(song: Song | null | undefined): song is Song {
  return !!song && Boolean(song.filePath || song.url) && song.fileExists !== false;
}

function time(value: unknown) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Small stable string hash, so daily picks change once a day rather than on every render. */
function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
}

export function localDayKey(now: Date) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Most recently played first. Songs without a recorded play are left out. */
export function pickRecentlyPlayed(songs: readonly Song[], limit = 10): Song[] {
  return songs
    .filter((song) => playable(song) && time(song.lastPlayed) > 0)
    .sort((a, b) => time(b.lastPlayed) - time(a.lastPlayed))
    .slice(0, limit);
}

/** Albums with the newest additions first. Albums whose songs are all missing are skipped. */
export function pickNewAlbums(albums: readonly LocalAlbumEntry[], limit = 10): LocalAlbumEntry[] {
  return albums
    .filter((album) => album.songs.some(playable))
    .sort((a, b) => (b.latestAdded || 0) - (a.latestAdded || 0))
    .slice(0, limit);
}

/** Liked songs, most played first. */
export function pickLikedSongs(songs: readonly Song[], limit = 10): Song[] {
  return songs
    .filter((song) => song.liked && playable(song))
    .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
    .slice(0, limit);
}

/** Songs played often in the past that have not been played for a month. */
export function pickRediscover(songs: readonly Song[], now: Date, limit = 10): Song[] {
  const cutoff = now.getTime() - REDISCOVER_AFTER_DAYS * DAY_MS;
  return songs
    .filter((song) => playable(song) && (song.playCount || 0) >= REDISCOVER_MIN_PLAYS && time(song.lastPlayed) > 0 && time(song.lastPlayed) < cutoff)
    .sort((a, b) => (b.playCount || 0) - (a.playCount || 0) || time(a.lastPlayed) - time(b.lastPlayed))
    .slice(0, limit);
}

/** Songs that have never been played, in a shuffle that changes once a day. */
export function pickNotPlayedYet(songs: readonly Song[], now: Date, limit = 10): Song[] {
  const day = localDayKey(now);
  return songs
    .filter((song) => playable(song) && !(song.playCount || 0))
    .map((song) => ({ song, order: hash(`${day}:${song.id}`) }))
    .sort((a, b) => a.order - b.order)
    .slice(0, limit)
    .map(({ song }) => song);
}
