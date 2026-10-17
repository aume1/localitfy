import type { Playlist } from "./playlist.types";
import type { Song } from "../library/song.types";

export function prepareGeneratedPlaylist(name: string, ids: string[], songsById: Map<string, Song>, playlists: Playlist[]) {
  const songIds = [...new Set(ids)].filter((id) => {
    const song = songsById.get(id);
    return song && song.fileExists !== false;
  });
  if (!songIds.length) return null;
  const base = (name.trim() || "Daily mix").slice(0, 110);
  const existing = playlists.find((playlist) => playlist.name.toLowerCase() === base.toLowerCase()
    && playlist.songIds.length === songIds.length && playlist.songIds.every((id, index) => id === songIds[index]));
  let uniqueName = base; let suffix = 2;
  while (!existing && playlists.some((playlist) => playlist.name.toLowerCase() === uniqueName.toLowerCase())) uniqueName = `${base} (${suffix++})`;
  return { name: uniqueName, songIds, existingId: existing?.id };
}
