/**
 * Three-way merge for phone sync. `base` is what both sides agreed on at the last sync, `mac` is the Mac now
 * and `phone` is this phone now. Only the phone's own edits are pushed; the Mac applies them and the phone
 * then adopts the Mac's result. When both sides changed the same thing, the phone's edit wins, except that
 * play counts add up, an edited playlist is kept over a deleted one, and the newer like or unlike wins.
 */

export const EDITABLE_SONG_FIELDS = ["liked", "title", "artist", "album", "genre", "volumeGain", "customVolume"] as const;
type EditableField = typeof EDITABLE_SONG_FIELDS[number];

export type SyncSongFields = {
  id: string;
  liked?: boolean;
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  volumeGain?: number;
  customVolume?: number;
  playCount?: number;
  lastPlayed?: string | null;
};

/** likedAt: when the like was tapped, on the Mac's clock, so the newest tap on either device wins. */
export type SongChange = Partial<Pick<SyncSongFields, EditableField>> & { playCountDelta?: number; lastPlayed?: string; likedAt?: number };

export type SyncPlaylist = { id: string; name: string; songIds: string[]; createdAt: number; coverArtwork?: string };

const time = (value?: string | null) => (value ? Date.parse(value) || 0 : 0);

/** Edits the phone made to songs since the last sync, keyed by song ID. */
export function phoneSongChanges(base: Map<string, SyncSongFields>, phone: Iterable<SyncSongFields>) {
  const changes: Record<string, SongChange> = {};
  for (const song of phone) {
    const before = base.get(song.id);
    if (!before) continue;
    const change: SongChange = {};
    for (const field of EDITABLE_SONG_FIELDS) {
      if (song[field] !== undefined && song[field] !== before[field]) (change as Record<string, unknown>)[field] = song[field];
    }
    const delta = Math.round(Number(song.playCount || 0) - Number(before.playCount || 0));
    if (delta > 0) change.playCountDelta = delta;
    if (song.lastPlayed && time(song.lastPlayed) > time(before.lastPlayed)) change.lastPlayed = song.lastPlayed;
    if (Object.keys(change).length) changes[song.id] = change;
  }
  return changes;
}

export { mergeSongIds, phonePlaylistChanges } from "../../features/playlists/playlistMerge";
