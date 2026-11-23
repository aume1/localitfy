import { useLayoutEffect, useRef, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { Cover } from "../covers/Cover";
import type { LocalAlbumEntry } from "./album.types";
import type { Playlist } from "../playlists/playlist.types";
import "./album-playlist-dialog.css";

type Props = {
  album: LocalAlbumEntry;
  playlists: readonly Playlist[];
  onAdd: (playlistId: string, songIds: string[]) => unknown;
  onCreate: (name: string, songIds: string[]) => unknown;
  onClose: () => void;
};

export default function AlbumPlaylistDialog({ album, playlists, onAdd, onCreate, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const songIds = album.songs.filter(song => song.fileExists !== false).map(song => song.id);
  const results = playlists.filter(playlist => playlist.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  const add = (playlistId: string) => { onAdd(playlistId, songIds); onClose(); };
  const create = () => {
    const title = name.trim().slice(0, 120);
    if (!title || !songIds.length) return;
    const existing = playlists.find(playlist => playlist.name.trim().toLocaleLowerCase() === title.toLocaleLowerCase());
    if (existing) onAdd(existing.id, songIds);
    else onCreate(title, songIds);
    onClose();
  };
  return <dialog ref={dialogRef} className="albumPlaylistDialog" aria-label={`Add ${album.title} to a playlist`}
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="albumPlaylistDialogHead">
      <Cover song={album.coverSong} className="albumPlaylistDialogCover" />
      <div><small>save album tracks</small><h2>{album.title}</h2><p>{songIds.length} tracks · {album.artist}</p></div>
      <button className="albumPlaylistDialogClose" type="button" aria-label="Close" onClick={onClose}><X size={18} /></button>
    </header>
    <div className="albumPlaylistDialogSearch">
      <Search size={15} aria-hidden="true" />
      <input autoFocus aria-label="Search playlists" placeholder="Find a playlist" value={query} onChange={event => setQuery(event.target.value)} />
    </div>
    <div className="albumPlaylistDialogList">
      {results.map(playlist => {
        const existing = songIds.filter(id => playlist.songIds.includes(id)).length;
        return <button type="button" key={playlist.id} onClick={() => add(playlist.id)} disabled={!songIds.length || existing === songIds.length}>
          <span className="albumPlaylistDialogListIcon">{existing === songIds.length ? <Check size={17}/> : <Plus size={17}/>}</span>
          <span><strong>{playlist.name}</strong><small>{existing ? `${existing} of ${songIds.length} already added` : `${playlist.songIds.length} tracks`}</small></span>
        </button>;
      })}
      {!results.length ? <p className="albumPlaylistDialogEmpty">{playlists.length ? "No matching playlists." : "Create a playlist below to save this album."}</p> : null}
    </div>
    {creating ? <form className="albumPlaylistDialogCreate" onSubmit={event => { event.preventDefault(); create(); }}>
      <input aria-label="New playlist name" autoFocus maxLength={120} placeholder="Playlist name" value={name} onChange={event => setName(event.target.value)}/>
      <button type="submit" disabled={!name.trim() || !songIds.length}>{playlists.some(item => item.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase()) ? "Add tracks" : "Create"}</button>
    </form> : <button className="albumPlaylistDialogNew" type="button" onClick={() => setCreating(true)}><Plus size={16}/> New playlist from album</button>}
  </dialog>;
}
