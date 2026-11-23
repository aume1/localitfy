import "../../shared/ui/collection-layout.css";
import "./playlists.css";
import "./playlist-oled.css";
import { isAndroidApp } from "../../app/platform";
import DailyMixesShelf, { type DailyMixesShelfProps } from "../analysis/DailyMixesShelf";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Check, Copy, ImagePlus, Pencil, Plus, Radio, Trash2, X } from "lucide-react";
import type { SimilarSeedRequest } from "../analysis/similarSeed";
import { notForMeTest, type NotForMeMarks } from "../analysis/notForMe";
import PlaylistRecommendations from "./components/PlaylistRecommendations";
import { ActionLabel } from "../../shared/ui/ActionLabel";
import { Button } from "../../vendor/beui/button";
import { PageHeader } from "../../shared/ui/PageHeader";
import { LocaltifyStateCard, MetaDividerDot } from "../../shared/ui/LocaltifyViewUi";
import { VirtualPlaylistTrackList } from "./components/VirtualPlaylistTrackList";
import PlaylistCoverCollage from "./components/PlaylistCoverCollage";
import { preparePlaylistArtwork } from "./playlistArtwork";
import { formatTime } from "../../shared/utils/format";
import type { Playlist } from "./playlist.types";
import type { Song } from "../library/song.types";
import { filterCollectionSongs, sortLibrarySongs, type LibrarySortMode } from "../library/librarySort";
import { MediaCard } from "../../shared/ui/MediaCard";
import { playlistTarget, playableIds, useAppActions } from "../shell/appActions";
import { PageAtmosphere } from "../covers/pageAtmosphere";
import CollectionHero from "../pages/CollectionHero";


export type PlaylistsViewProps = {
  dailyMixes: DailyMixesShelfProps;
  playSongs: (ids: string[], label: string) => unknown;
  selectSong: (id: string, autoplay?: boolean) => unknown;
  activePlaylistId: any;
  appendPlaylistSongAction: any;
  cancelRenamePlaylist: any;
  createPlaylist: any;
  currentId: any;
  draggedSongId: any;
  dropPlaylistSongAction: any;
  duplicatePlaylist: any;
  endPlaylistSongDragAction: any;
  handlePlaylistShelfDragLeave: any;
  handlePlaylistShelfDragOver: any;
  handlePlaylistShelfDrop: any;
  importSongs: any;
  isPlaying: any;
  newPlaylistName: any;
  openPlaylistSongContextMenuAction: any;
  playPlaylist: any;
  openSimilarSongs: (request: SimilarSeedRequest) => unknown;
  playlistDragOverPlaylistId: any;
  playlistSummaries: any;
  removePlaylist: any;
  removePlaylistSongAction: any;
  renamingPlaylistId: any;
  renamingPlaylistName: any;
  savePlaylistRename: any;
  setPlaylistArtwork: (id: string, value: string | null) => void;
  selectPlaylistSongAction: (songId: string, playlistId?: string) => void;
  selectedPlaylist: any;
  selectedPlaylistDuration: any;
  selectedPlaylistSongs: any;
  setNewPlaylistName: any;
  setRenamingPlaylistName: any;
  setSelectedPlaylistId: any;
  songs: any;
  startPlaylistSongDragAction: any;
  startRenamePlaylist: any;
  /** The playlist page being shown; null shows every playlist. */
  detailPlaylistId?: string | null;
  addSongToPlaylist: (playlistId: string, songId: string) => unknown;
  notForMe: { marks: NotForMeMarks };
};

export default function PlaylistsView(props: PlaylistsViewProps) {
  const {
    activePlaylistId,
    appendPlaylistSongAction,
    cancelRenamePlaylist,
    createPlaylist,
    currentId,
    draggedSongId,
    dropPlaylistSongAction,
    duplicatePlaylist,
    endPlaylistSongDragAction,
    handlePlaylistShelfDragLeave,
    handlePlaylistShelfDragOver,
    handlePlaylistShelfDrop,
    importSongs,
    isPlaying,
    newPlaylistName,
    openPlaylistSongContextMenuAction,
    playPlaylist,
    playlistDragOverPlaylistId,
    playlistSummaries,
    removePlaylist,
    removePlaylistSongAction,
    renamingPlaylistId,
    renamingPlaylistName,
    savePlaylistRename,
    selectPlaylistSongAction,
    selectedPlaylist,
    setNewPlaylistName,
    setRenamingPlaylistName,
    setSelectedPlaylistId,
    songs,
    startPlaylistSongDragAction,
    startRenamePlaylist
  } = props;
  const [playlistQuery, setPlaylistQuery] = useState("");
  const [trackQuery, setTrackQuery] = useState("");
  const [trackSort,setTrackSort]=useState<LibrarySortMode>("library");
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverError, setCoverError] = useState("");
  const coverInput = useRef<HTMLInputElement>(null);
  const visiblePlaylists = useMemo(() => playlistSummaries.filter((summary: { playlist: Playlist }) =>
    summary.playlist.name.toLocaleLowerCase().includes(playlistQuery.trim().toLocaleLowerCase())), [playlistSummaries, playlistQuery]);
  const hidden = useMemo(() => notForMeTest(props.notForMe.marks), [props.notForMe.marks]);
  const playlists = useMemo(() => playlistSummaries.map((summary: { playlist: Playlist }) => summary.playlist), [playlistSummaries]);
  const actions = useAppActions();
  const songsById = useMemo(() => new Map<string, Song>((songs as Song[]).map((song) => [song.id, song])), [songs]);
  const detailId = props.detailPlaylistId || null;
  // Adding a song to another playlist selects that one; the page keeps the selection on its own playlist,
  // which the track list's play, drop and remove actions act on.
  useEffect(() => { if (detailId && selectedPlaylist?.id !== detailId) setSelectedPlaylistId(detailId); }, [detailId, selectedPlaylist?.id, setSelectedPlaylistId]);
  const detailPlaylist: Playlist | null = detailId ? playlistSummaries.find((summary: { playlist: Playlist }) => summary.playlist.id === detailId)?.playlist ?? null : null;
  const detailSongs = useMemo(() => detailPlaylist?.songIds.flatMap((id) => songsById.get(id) ?? []) ?? [], [detailPlaylist, songsById]);
  useEffect(() => { setTrackQuery(""); setTrackSort("library"); setCoverError(""); }, [detailId]);
  const sortedDetailSongs = useMemo(()=>sortLibrarySongs(detailSongs,trackSort),[detailSongs,trackSort]);
  const filteredDetailSongs = useMemo(()=>filterCollectionSongs(sortedDetailSongs,trackQuery),[sortedDetailSongs,trackQuery]);
  if (detailId) {
    if (!detailPlaylist) {
      return (
        <section data-page-section="playlists" className="playlistsPage playlistPageV029">
          <LocaltifyStateCard centered tone="info" eyebrow="playlist" title="This playlist is gone" message="It was removed since you opened it."
            actions={<button className="softButton" type="button" onClick={() => actions.nav.go("playlists")}>all playlists</button>} />
        </section>
      );
    }
    const target = playlistTarget(detailPlaylist, detailSongs);
    // Give the existing playlist playback owner the sorted snapshot. Never modify saved songIds.
    // Sorting changes the view and explicit add-to-queue order, not the saved playlist
    // or its repeat/playback context.
    const playbackTarget = trackSort === "library" ? target : playlistTarget(detailPlaylist,sortedDetailSongs);
    return (
      <section data-page-section="playlists" className="playlistsPage playlistPageV029 playlistDetailPage">
      <PageAtmosphere songs={detailSongs} custom={detailPlaylist.coverArtwork} />
        <CollectionHero
          typeLabel="playlist"
          title={detailPlaylist.name}
          cover={<PlaylistCoverCollage songs={detailSongs} coverArtwork={detailPlaylist.coverArtwork} className="collectionHeroCover playlistCoverCollage" />}
          coverSong={target.coverSong}
          stats={`${detailSongs.length} song${detailSongs.length === 1 ? "" : "s"} · ${formatTime(detailSongs.reduce((total, song) => total + (Number(song.duration) || 0), 0))}`}
          playable={playableIds(detailSongs).length}
          onPlay={() => void playPlaylist(detailPlaylist, false)}
          onShuffle={() => void playPlaylist(detailPlaylist, true)}
          onQueue={() => actions.queueCollection(playbackTarget)}
          onMore={(event) => actions.openCollectionMenu(event, target)}
          sort={{value:trackSort,onChange:setTrackSort,defaultLabel:"Playlist order"}}
          search={<input type="search" className="pageHeaderSearch" aria-label="Search playlist tracks" placeholder="Search tracks" value={trackQuery} onChange={event => setTrackQuery(event.currentTarget.value)} />}
        >
          <button className="collectionIconButton" type="button" onClick={() => props.openSimilarSongs({ kind: "playlist", playlistId: detailPlaylist.id })}
            disabled={detailSongs.length === 0} aria-label="more like this playlist" title="Find songs in your library that sound like this playlist">
            <Radio size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
          <input ref={coverInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={async event => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            setCoverError(""); setCoverBusy(true);
            try { props.setPlaylistArtwork(detailPlaylist.id, await preparePlaylistArtwork(file)); }
            catch { setCoverError("Could not load that image. Choose a JPG, PNG or WebP under 12 MB."); }
            finally { setCoverBusy(false); }
          }} />
          <button className="collectionIconButton" type="button" disabled={coverBusy} aria-label="Upload playlist artwork" title="Upload playlist artwork" onClick={() => coverInput.current?.click()}><ImagePlus size={16} /></button>
          {detailPlaylist.coverArtwork ? <button className="collectionIconButton" type="button" disabled={coverBusy} aria-label="Reset playlist artwork" title="Reset playlist artwork" onClick={() => props.setPlaylistArtwork(detailPlaylist.id, null)}><X size={16} /></button> : null}
        </CollectionHero>
        {coverError ? <p role="alert">{coverError}</p> : null}

        <section className="playlistTracksPanel">
          <div className="panelHead playlistTracksHead">
            <div className="playlistTracksTitleBlock">
              {renamingPlaylistId === detailPlaylist.id ? (
                <form
                  className="playlistRenameForm"
                  onSubmit={(event) => {
                    event.preventDefault();
                    savePlaylistRename(detailPlaylist.id);
                  }}
                >
                  <input
                    value={renamingPlaylistName}
                    onChange={(event) => setRenamingPlaylistName(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") cancelRenamePlaylist();
                    }}
                    aria-label="Playlist name"
                    placeholder="playlist name"
                    autoFocus
                  />
                  <button className="settingsTinyButton" type="submit"><ActionLabel icon={Check}>save</ActionLabel></button>
                  <button className="settingsTinyButton" type="button" onClick={cancelRenamePlaylist}><ActionLabel icon={X}>cancel</ActionLabel></button>
                </form>
              ) : (
                <h3>Tracks</h3>
              )}
            </div>

            <div className="playlistManageActions">
              <button className="settingsTinyButton" type="button" onClick={() => startRenamePlaylist(detailPlaylist)}><ActionLabel icon={Pencil}>rename</ActionLabel></button>
              <button className="settingsTinyButton" type="button" onClick={() => duplicatePlaylist(detailPlaylist.id)}><ActionLabel icon={Copy}>duplicate</ActionLabel></button>
              <button className="settingsTinyButton danger" type="button" onClick={() => { removePlaylist(detailPlaylist.id); actions.nav.go("playlists"); }}><ActionLabel icon={Trash2}>remove</ActionLabel></button>
            </div>
          </div>

          {trackQuery.trim() && !filteredDetailSongs.length ? <p role="status">No matching tracks.</p> : <VirtualPlaylistTrackList
            selectedPlaylistId={detailPlaylist.id}
            list={filteredDetailSongs}
            editable={true}
            reorderable={!trackQuery.trim() && trackSort==="library"}
            currentId={currentId}
            isPlaying={isPlaying}
            draggedSongId={draggedSongId}
            onSelectSong={(id) => selectPlaylistSongAction(id, detailPlaylist.id)}
            onStartSongDrag={startPlaylistSongDragAction}
            onDropSong={dropPlaylistSongAction}
            onAppendSong={appendPlaylistSongAction}
            onDragEnd={endPlaylistSongDragAction}
            onOpenContextMenu={openPlaylistSongContextMenuAction}
            onRemoveSong={removePlaylistSongAction}
          />}
          {detailSongs.length > 0 ? (
            <PlaylistRecommendations playlist={detailPlaylist} songs={songs as Song[]} playlists={playlists} currentId={currentId} hidden={hidden}
              addSongToPlaylist={props.addSongToPlaylist} selectSong={props.selectSong} />
          ) : null}
        </section>
      </section>
    );
  }

  return (
    <section data-page-section="playlists" className="playlistsPage playlistPageV029 collectionBrowsePage">
      <PageHeader title="Playlists">
        <input className="pageHeaderSearch" type="search" value={playlistQuery} onChange={event => setPlaylistQuery(event.currentTarget.value)} placeholder="Search playlists" aria-label="Search playlists" />
        <span className="pageHeaderCount"><strong>{visiblePlaylists.length}</strong> playlist{visiblePlaylists.length === 1 ? "" : "s"}</span>
      </PageHeader>
      <div className="playlistToolbar" aria-label="Playlist actions">
        <form
          className="playlistCreateForm"
          onSubmit={(event) => {
            event.preventDefault();
            const id = createPlaylist();
            if (id) actions.nav.open({ kind: "playlist", id });
          }}
        >
          <input
            className="pageHeaderSearch playlistNameInput"
            value={newPlaylistName}
            onChange={(event) => setNewPlaylistName(event.currentTarget.value)}
            placeholder="Name your playlist"
            aria-label="New playlist name"
            maxLength={120}
          />
          <Button className="playlistAction playlistActionPrimary" type="submit"><ActionLabel icon={Plus}>Create playlist</ActionLabel></Button>
        </form>
      </div>

      <div className="playlistContentGrid isEmpty">
        <section className="playlistShelfPanel">
          <div className="panelHead">
            <div>
              <h3>Your playlists</h3>
            </div>
          </div>

          <div className="collectionBrowseGrid">
            {visiblePlaylists.length ? visiblePlaylists.map(({ playlist, previewSongs, songCount, duration }, index) => (
              <MediaCard
                key={playlist.id}
                className={`collectionBrowseCard playlistShelfCard ${activePlaylistId === playlist.id ? "playing" : ""} ${playlistDragOverPlaylistId === playlist.id ? "dropTarget" : ""}`}
                style={{ "--playlist-stagger": Math.min(index, 12) } as CSSProperties}
                openLabel={`open ${playlist.name}`}
                playLabel={`play ${playlist.name}`}
                onOpen={() => actions.openCollection(playlistTarget(playlist, previewSongs))}
                onPlay={() => void playPlaylist(playlist, false)}
                onContextMenu={(event) => actions.openCollectionMenu(event, playlistTarget(playlist, playlist.songIds.flatMap((id: string) => songsById.get(id) ?? [])))}
                onDragOver={(event) => handlePlaylistShelfDragOver(event, playlist.id)}
                onDragLeave={(event) => handlePlaylistShelfDragLeave(event, playlist.id)}
                onDrop={(event) => handlePlaylistShelfDrop(event, playlist.id)}
                title="drop a song here to add it"
                cover={<PlaylistCoverCollage songs={previewSongs} coverArtwork={playlist.coverArtwork} className="collectionBrowseCardCover playlistCoverCollage" />}
              >
                <span >
                  <strong>{playlist.name}</strong>
                  <small>{songCount} song{songCount === 1 ? "" : "s"}<MetaDividerDot />{formatTime(duration)}</small>
                </span>
                {playlistDragOverPlaylistId === playlist.id ? <span className="playlistShelfDropHint">Drop to add</span> : null}
              </MediaCard>
            )) : (
              <LocaltifyStateCard
                centered
                cute
                tone={songs.length ? "info" : "warning"}
                eyebrow="playlists"
                title={playlistQuery ? "No matching playlists" : "No playlists yet"}
                message={playlistQuery ? "Try another playlist name." : songs.length ? "Name a playlist above to get started." : "Import songs to start your collection."}
                actions={songs.length ? (
                  <button className="mainAction" type="button" onClick={() => { if (playlistQuery) setPlaylistQuery(""); else document.querySelector<HTMLInputElement>(".playlistNameInput")?.focus(); }}>
                    {playlistQuery ? "Clear search" : "Name a playlist"}
                  </button>
                ) : isAndroidApp() ? null : (
                  <button className="mainAction" type="button" onClick={importSongs}>import songs</button>
                )}
              />
            )}
          </div>
        </section>

      </div>
      <DailyMixesShelf {...props.dailyMixes} />
    </section>
  );
}
