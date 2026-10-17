import { Disc3, Heart, ListEnd, Pencil, Play, Plus, SkipForward, Trash2, UserRound } from "lucide-react";
import { Cover } from "../../covers/Cover";
import { prettyMeta, prettyTitle } from "../../search";
import { splitArtistCredits } from "../../artists/artistCredits";
import type { Song, SongContextMenuState } from "../song.types";
import "./song-context-menu.css";

const MAX_ARTIST_LINKS = 3;

export type SongContextMenuProps = {
  state: SongContextMenuState | null;
  songsById: Map<string, Song>;
  onClose: () => void;
  selectSong: (songId: string, autoplay?: boolean) => unknown;
  queueSong: (songId: string, playNext?: boolean) => unknown;
  openEditor: (song: Song) => unknown;
  openPlaylistPicker: (song: Song) => unknown;
  toggleLike: (songId: string) => unknown;
  askRemoveSong: (songId: string) => unknown;
  goToArtist: (artistName: string) => unknown;
  goToAlbum: (song: Song) => unknown;
};

export default function SongContextMenu({
  state,
  songsById,
  onClose,
  selectSong,
  queueSong,
  openEditor,
  openPlaylistPicker,
  toggleLike,
  askRemoveSong,
  goToArtist,
  goToAlbum
}: SongContextMenuProps) {
  if (!state) return null;
  const song = songsById.get(state.songId);
  if (!song) return null;
  const artistNames = splitArtistCredits(song.artist).slice(0, MAX_ARTIST_LINKS);

  return (
    <div className="songContextMenuLayer" onClick={onClose}>
      <div
        className="songContextMenu"
        style={{ left: state.x, top: state.y }}
        role="menu"
        aria-label="song actions"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="songContextMenuHead">
          <Cover song={song} className="songContextMenuCover" />
          <span>
            <strong>{prettyTitle(song.title, 6)}</strong>
            <small>{prettyMeta(song.artist)}</small>
          </span>
        </div>
        <button type="button" role="menuitem" onClick={() => { onClose(); void selectSong(song.id, true); }}>
          <span className="songContextMenuIcon"><Play size={13} strokeWidth={3} /></span> play now
        </button>
        <button type="button" role="menuitem" onClick={() => { onClose(); queueSong(song.id, true); }}>
          <span className="songContextMenuIcon"><SkipForward size={13} strokeWidth={3} /></span> play next
        </button>
        <button type="button" role="menuitem" onClick={() => { onClose(); queueSong(song.id, false); }}>
          <span className="songContextMenuIcon"><ListEnd size={13} strokeWidth={3} /></span> add to queue
        </button>
        <div className="songContextMenuDivider" aria-hidden="true" />
        <button type="button" role="menuitem" onClick={() => { onClose(); openPlaylistPicker(song); }}>
          <span className="songContextMenuIcon"><Plus size={13} strokeWidth={3} /></span> add to playlist
        </button>
        <button type="button" role="menuitem" onClick={() => { onClose(); toggleLike(song.id); }}>
          <span className="songContextMenuIcon"><Heart size={13} strokeWidth={3} /></span> {song.liked ? "remove from liked songs" : "save to liked songs"}
        </button>
        <div className="songContextMenuDivider" aria-hidden="true" />
        {artistNames.map((artistName) => (
          <button key={artistName} type="button" role="menuitem" onClick={() => { onClose(); goToArtist(artistName); }}>
            <span className="songContextMenuIcon"><UserRound size={13} strokeWidth={3} /></span> go to {artistNames.length > 1 ? prettyMeta(artistName) : "artist"}
          </button>
        ))}
        {song.album?.trim() ? (
          <button type="button" role="menuitem" onClick={() => { onClose(); goToAlbum(song); }}>
            <span className="songContextMenuIcon"><Disc3 size={13} strokeWidth={3} /></span> go to album
          </button>
        ) : null}
        <div className="songContextMenuDivider" aria-hidden="true" />
        <button type="button" role="menuitem" onClick={() => { onClose(); openEditor(song); }}>
          <span className="songContextMenuIcon"><Pencil size={13} strokeWidth={3} /></span> edit song data
        </button>
        <button className="dangerMenuItem" type="button" role="menuitem" onClick={() => { onClose(); askRemoveSong(song.id); }}>
          <span className="songContextMenuIcon"><Trash2 size={13} strokeWidth={3} /></span> remove from library
        </button>
      </div>
    </div>
  );
}
