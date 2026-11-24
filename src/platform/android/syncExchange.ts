import type { PlayEvent } from "../../features/player/listeningHistory";
import type { Song } from "../../features/library/song.types";
import { EDITABLE_SONG_FIELDS, phonePlaylistChanges, phoneSongChanges, type SongChange, type SyncPlaylist, type SyncSongFields } from "./syncMerge";

/** Persisted before sending. Retries keep the same sequence, payload, and phone-side merge baseline. */
export type SyncBatch = {
  sequence: number;
  pairingToken: string;
  songs: Record<string, SongChange>;
  playlists: ReturnType<typeof phonePlaylistChanges>;
  playEvents: PlayEvent[];
  sentSongs: SyncSongFields[];
  sentPlaylists: SyncPlaylist[];
  playlistExpected?: [string, SyncPlaylist | null][];
};

export const eventVersion = (event: PlayEvent) => JSON.stringify([
  event.id, event.sessionId, event.songId, event.startedAt, event.updatedAt, event.endedAt,
  event.msListened, event.outcome, event.contextType, event.contextId
]);

/** Reapply only edits made AFTER this batch was captured, on top of the Mac's acknowledged result. */
export function rebaseSongEdits(sent: SyncSongFields[], current: SyncSongFields[], received: SyncSongFields[], edits: Record<string, Partial<Song>>) {
  const later = phoneSongChanges(new Map(sent.map((song) => [song.id, song])), current);
  const synced = new Set<string>([...EDITABLE_SONG_FIELDS, "playCount", "lastPlayed"]);
  const next: Record<string, Partial<Song>> = {};
  for (const song of received) {
    const local = Object.fromEntries(Object.entries(edits[song.id] || {}).filter(([key]) => !synced.has(key)));
    const { playCountDelta, ...patch } = later[song.id] || {};
    if (playCountDelta) local.playCount = Number(song.playCount || 0) + playCountDelta;
    Object.assign(local, patch);
    if (Object.keys(local).length) next[song.id] = local;
  }
  return { edits: next, changed: Object.keys(later).length > 0 };
}

export { rebasePlaylists } from "../../features/playlists/playlistMerge";
