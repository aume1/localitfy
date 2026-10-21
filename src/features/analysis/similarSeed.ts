import type { Song } from "../library/song.types";
import type { Playlist } from "../playlists/playlist.types";

/** What the user asked to find similar songs for. */
export type SimilarSeedRequest =
  | { kind: "song"; songId: string }
  | { kind: "playlist"; playlistId: string }
  | { kind: "liked" }
  | { kind: "recent" };

export type SimilarSongsQuery = { songId: string } | { songIds: string[]; seedKey: string } | { recent: true };

/** A resolved seed: a single song, or a group shown with a cover collage. `key` is echoed back as the result's `seedId`. */
export type SimilarSeed =
  | { kind: "song"; key: string; song: Song; query: SimilarSongsQuery }
  | { kind: "group"; key: string; title: string; label: string; songs: Song[]; query: SimilarSongsQuery };

function playable(song: Song | undefined): song is Song {
  return !!song && song.fileExists !== false;
}

export function resolveSimilarSeed(request: SimilarSeedRequest | null, songsById: Map<string, Song>,
  songs: readonly Song[], playlists: readonly Playlist[]): SimilarSeed | null {
  if (!request) return null;
  if (request.kind === "song") {
    const song = songsById.get(request.songId);
    return song ? { kind: "song", key: song.id, song, query: { songId: song.id } } : null;
  }
  if (request.kind === "recent") {
    const recent = songs.filter((song) => playable(song) && song.lastPlayed)
      .sort((a, b) => String(b.lastPlayed).localeCompare(String(a.lastPlayed))).slice(0, 4);
    return { kind: "group", key: "recent", title: "Based on your recent listening", label: "Songs you played through in the last 30 days", songs: recent, query: { recent: true } };
  }
  if (request.kind === "liked") {
    const liked = songs.filter((song) => song.liked && playable(song));
    if (!liked.length) return null;
    return { kind: "group", key: "liked", title: "More like your liked songs", label: `${liked.length} liked song${liked.length === 1 ? "" : "s"}`,
      songs: liked, query: { songIds: liked.map((song) => song.id), seedKey: "liked" } };
  }
  const playlist = playlists.find((item) => item.id === request.playlistId);
  const members = playlist?.songIds.map((id) => songsById.get(id)).filter(playable) || [];
  if (!playlist || !members.length) return null;
  const key = `playlist:${playlist.id}`.slice(0, 200);
  return { kind: "group", key, title: "More like this playlist", label: playlist.name, songs: members,
    query: { songIds: members.map((song) => song.id), seedKey: key } };
}
