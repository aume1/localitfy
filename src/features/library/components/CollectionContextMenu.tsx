import { Disc3, ListEnd, ListMusic, ListPlus, Pencil, Play, Radio, Shuffle, Tags, UserRound } from "lucide-react";
import { Cover } from "../../covers/Cover";
import { isAndroidApp } from "../../../app/platform";
import { ContextMenuLayer } from "../../../shared/ui/ContextMenuLayer";
import { prettyMeta, prettyTitle } from "../../search/search.utils";
import { splitArtistCredits } from "../../artists/artistCredits";
import { playableIds, type CollectionTarget, type PlayCollectionOptions } from "../../shell/appActions";
import type { LocalAlbumEntry } from "../../albums/album.types";
import "./song-context-menu.css";

const OPEN_LABELS: Record<CollectionTarget["kind"], string> = {
  album: "open album", artist: "open artist", genre: "open genre", playlist: "open playlist", mix: "open mix"
};

export type CollectionContextMenuState = { target: CollectionTarget; x: number; y: number };
export type CollectionContextMenuProps = {
  state: CollectionContextMenuState | null;
  onClose: () => void;
  open: (target: CollectionTarget) => unknown;
  play: (target: CollectionTarget, options?: PlayCollectionOptions) => unknown;
  queue: (target: CollectionTarget) => unknown;
  findSimilar: (target: CollectionTarget) => unknown;
  goToArtist?: (artistName: string) => unknown;
  addAlbumToPlaylist?: (album: LocalAlbumEntry) => unknown;
  editAlbum?: (album: LocalAlbumEntry) => unknown;
  findAlbumOnMusicBrainz?: (album: LocalAlbumEntry) => unknown;
  completeAlbum?: (album: LocalAlbumEntry) => unknown;
};

export default function CollectionContextMenu({
  state, onClose, open, play, queue, findSimilar, goToArtist,
  addAlbumToPlaylist, editAlbum, findAlbumOnMusicBrainz, completeAlbum
}: CollectionContextMenuProps) {
  if (!state) return null;
  const { target } = state;
  const album = target.album;
  const ids = playableIds(target.songs);
  const artists = album && goToArtist ? splitArtistCredits(album.albumArtist || album.artist).slice(0, 3) : [];
  const editable = (album as { source?: string } | undefined)?.source === "manual";
  const run = (action: () => unknown) => () => { onClose(); void action(); };

  return (
    <ContextMenuLayer anchor={state} identity={`${target.kind}:${target.id}`}
      label={`${target.kind} actions`} onClose={onClose}>
        <div className="songContextMenuHead">
          <Cover song={target.coverSong} className="songContextMenuCover" />
          <span><strong>{prettyTitle(target.title, 6)}</strong><small>{prettyMeta(target.subtitle)}</small></span>
        </div>
        <button type="button" role="menuitem" onClick={run(() => open(target))}>
          <span className="songContextMenuIcon">{target.kind === "album" ? <Disc3 size={13}/> : target.kind === "artist" ? <UserRound size={13}/> : <ListMusic size={13}/>}</span> {OPEN_LABELS[target.kind]}
        </button>
        <button type="button" role="menuitem" disabled={!ids.length} onClick={run(() => play(target))}>
          <span className="songContextMenuIcon"><Play size={13}/></span> play
        </button>
        <button type="button" role="menuitem" disabled={ids.length < 2} onClick={run(() => play(target, { shuffle: true }))}>
          <span className="songContextMenuIcon"><Shuffle size={13}/></span> shuffle
        </button>
        <button type="button" role="menuitem" disabled={!ids.length} onClick={run(() => queue(target))}>
          <span className="songContextMenuIcon"><ListEnd size={13}/></span> add to queue
        </button>
        <button type="button" role="menuitem" disabled={!ids.length} onClick={run(() => findSimilar(target))}>
          <span className="songContextMenuIcon"><Radio size={13}/></span> similar songs
        </button>
        {album ? <>
          <div className="songContextMenuDivider" aria-hidden="true" />
          {addAlbumToPlaylist ? <button type="button" role="menuitem" onClick={run(() => addAlbumToPlaylist(album))}>
            <span className="songContextMenuIcon"><ListPlus size={13}/></span> add album to playlist
          </button> : null}
          {artists.map(name => <button key={name} type="button" role="menuitem" onClick={run(() => goToArtist?.(name))}>
            <span className="songContextMenuIcon"><UserRound size={13}/></span> go to {artists.length > 1 ? prettyMeta(name) : "artist"}
          </button>)}
          {editable && editAlbum && !isAndroidApp() ? <button type="button" role="menuitem" onClick={run(() => editAlbum(album))}>
            <span className="songContextMenuIcon"><Pencil size={13}/></span> edit album
          </button> : null}
          {completeAlbum ? <button type="button" role="menuitem" onClick={run(() => completeAlbum(album))}>
            <span className="songContextMenuIcon"><ListPlus size={13}/></span> complete album
          </button> : null}
          {findAlbumOnMusicBrainz && album.songs.some(song => Boolean(song.filePath)) ?
            <button type="button" role="menuitem" onClick={run(() => findAlbumOnMusicBrainz(album))}>
              <span className="songContextMenuIcon"><Tags size={13}/></span> find on MusicBrainz
            </button> : null}
        </> : null}
    </ContextMenuLayer>
  );
}
