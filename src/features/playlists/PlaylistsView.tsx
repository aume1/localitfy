import "./playlists.css";
import DailyMixesShelf, { type DailyMixesShelfProps } from "../analysis/DailyMixesShelf";
import { lazy, Suspense, useMemo, useState, type CSSProperties } from "react";
import { Check, Copy, Pencil, Play, Plus, Radio, Shuffle, SlidersHorizontal, Sparkles, Trash2, WandSparkles, X } from "lucide-react";
import type { SimilarSeedRequest } from "../analysis/similarSeed";
import { notForMeTest, type NotForMeMarks } from "../analysis/notForMe";
import PlaylistRecommendations from "./components/PlaylistRecommendations";
import { ActionLabel } from "../../shared/ui/ActionLabel";
import { PageHeader } from "../../shared/ui/PageHeader";
import { LocaltifyStateCard, MetaDividerDot } from "../../shared/ui/LocaltifyViewUi";
import { VirtualPlaylistTrackList } from "./components/VirtualPlaylistTrackList";
import PlaylistCoverCollage from "./components/PlaylistCoverCollage";
import { formatTime } from "../../shared/utils/format";
import type { Playlist } from "./playlist.types";
import { describeSmartRules, type ListeningCounts, type SmartRules } from "./smartPlaylist";

const SmartPlaylistDialog = lazy(() => import("./components/SmartPlaylistDialog"));
const PromptPlaylistDialog = lazy(() => import("./components/PromptPlaylistDialog"));

export type PlaylistsViewProps = {
  dailyMixes: DailyMixesShelfProps;
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
  selectPlaylistSongAction: any;
  selectedPlaylist: any;
  selectedPlaylistDuration: any;
  selectedPlaylistSongs: any;
  setNewPlaylistName: any;
  setRenamingPlaylistName: any;
  setSelectedPlaylistId: any;
  songs: any;
  startPlaylistSongDragAction: any;
  startRenamePlaylist: any;
  saveSmartPlaylist: (playlistId: string | null, name: string, rules: SmartRules) => string | null;
  listeningCounts: ListeningCounts;
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
    selectedPlaylistDuration,
    selectedPlaylistSongs,
    setNewPlaylistName,
    setRenamingPlaylistName,
    setSelectedPlaylistId,
    songs,
    startPlaylistSongDragAction,
    startRenamePlaylist
  } = props;
  // undefined: closed; null: creating a new smart playlist.
  const [smartEditing, setSmartEditing] = useState<Playlist | null | undefined>(undefined);
  const [prompting, setPrompting] = useState(false);
  const hidden = useMemo(() => notForMeTest(props.notForMe.marks), [props.notForMe.marks]);
  const playlists = useMemo(() => playlistSummaries.map((summary: { playlist: Playlist }) => summary.playlist), [playlistSummaries]);

  return (
    <section data-page-section="playlists" className="playlistsPage playlistPageV029">
      <PageHeader
        title="Playlists"
      >
        <form
          className="playlistCreateForm"
          onSubmit={(event) => {
            event.preventDefault();
            createPlaylist();
          }}
        >
          <input
            className="pageHeaderSearch"
            value={newPlaylistName}
            onChange={(event) => setNewPlaylistName(event.currentTarget.value)}
            placeholder="new playlist name"
            aria-label="New playlist name"
          />
          <button className="mainAction" type="submit"><ActionLabel icon={Plus}>new playlist</ActionLabel></button>
          <button className="softButton" type="button" onClick={() => setSmartEditing(null)} disabled={!songs.length}
            title="A playlist that fills itself from rules, like liked songs you haven't played lately">
            <ActionLabel icon={Sparkles}>smart playlist</ActionLabel>
          </button>
          <button className="softButton" type="button" onClick={() => setPrompting(true)} disabled={!songs.length}
            title="Describe a playlist, like chill songs you haven't played in a while, and pick the songs to keep">
            <ActionLabel icon={WandSparkles}>from a prompt</ActionLabel>
          </button>
        </form>
      </PageHeader>

      {selectedPlaylist ? (
        <section className="panel playlistHeroPanel">
          <div className="playlistHeroCopy">
            <p className="eyebrow">{selectedPlaylist.rules ? "smart playlist" : "playlist"}</p>
            <h3>{selectedPlaylist.name}</h3>
            <p>
              {selectedPlaylistSongs.length} song{selectedPlaylistSongs.length === 1 ? "" : "s"}
              <MetaDividerDot />
              {formatTime(selectedPlaylistDuration)} total
            </p>
            {selectedPlaylist.rules ? <p className="smartPlaylistSummary">{describeSmartRules(selectedPlaylist.rules)}</p> : null}
          </div>

          <PlaylistCoverCollage songs={selectedPlaylistSongs} className="playlistHeroCollage playlistCoverCollage" />

          <div className="playlistHeroActions">
            <button
              className="heroMain"
              type="button"
              onClick={() => void playPlaylist(selectedPlaylist, false)}
              disabled={selectedPlaylist.songIds.length === 0}
            >
              <ActionLabel icon={Play}>play</ActionLabel>
            </button>
            <button
              className="softButton"
              type="button"
              onClick={() => void playPlaylist(selectedPlaylist, true)}
              disabled={selectedPlaylist.songIds.length === 0}
            >
              <ActionLabel icon={Shuffle}>shuffle</ActionLabel>
            </button>
            <button
              className="softButton"
              type="button"
              onClick={() => props.openSimilarSongs({ kind: "playlist", playlistId: selectedPlaylist.id })}
              disabled={selectedPlaylistSongs.length === 0}
              title="Find songs in your library that sound like this playlist"
            >
              <ActionLabel icon={Radio}>more like this</ActionLabel>
            </button>
            {selectedPlaylist.rules ? (
              <button className="softButton" type="button" onClick={() => setSmartEditing(selectedPlaylist)}>
                <ActionLabel icon={SlidersHorizontal}>edit rules</ActionLabel>
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <DailyMixesShelf {...props.dailyMixes} />
      <div className={`playlistContentGrid ${playlistSummaries.length ? "" : "isEmpty"}`}>
        <section className="panel playlistShelfPanel">
          <div className="panelHead">
            <div>
              <p className="eyebrow">saved</p>
              <h3>your playlists</h3>
            </div>
          </div>

          <div className="playlistShelfGrid">
            {playlistSummaries.length ? playlistSummaries.map(({ playlist, previewSongs, songCount, duration }, index) => (
              <button
                key={playlist.id}
                className={`playlistShelfCard ${selectedPlaylist?.id === playlist.id ? "active" : ""} ${activePlaylistId === playlist.id ? "playing" : ""} ${playlistDragOverPlaylistId === playlist.id ? "dropTarget" : ""}`}
                style={{ "--playlist-stagger": Math.min(index, 12) } as CSSProperties}
                type="button"
                onClick={() => setSelectedPlaylistId(playlist.id)}
                onDragOver={(event) => handlePlaylistShelfDragOver(event, playlist.id)}
                onDragLeave={(event) => handlePlaylistShelfDragLeave(event, playlist.id)}
                onDrop={(event) => handlePlaylistShelfDrop(event, playlist.id)}
                title="drop a song here to add it"
              >
                <PlaylistCoverCollage songs={previewSongs} />
                <span className="playlistShelfMeta">
                  <strong>{playlist.name}</strong>
                  <small>{playlist.rules ? <>smart<MetaDividerDot /></> : null}{songCount} song{songCount === 1 ? "" : "s"}<MetaDividerDot />{formatTime(duration)}</small>
                </span>
                <span className="playlistShelfDropHint">{activePlaylistId === playlist.id ? "playing" : "drop song"}</span>
              </button>
            )) : (
              <LocaltifyStateCard
                centered
                cute
                badge="♫"
                tone={songs.length ? "info" : "warning"}
                eyebrow="playlists"
                title="No playlists yet"
                message={songs.length ? "Create a tiny mix and give your favorite songs a cozy corner." : "Import songs first, then make a playlist for gaming, studying, edits, or night drives."}
                detail={songs.length ? "Tip: you can also drag songs into a playlist card." : "Playlists are local and private."}
                actions={songs.length ? (
                  <button className="mainAction" type="button" onClick={() => {
                    createPlaylist(newPlaylistName.trim() || "my mix");
                  }}>
                    create playlist
                  </button>
                ) : (
                  <button className="mainAction" type="button" onClick={importSongs}>import songs</button>
                )}
              />
            )}
          </div>
        </section>

        {playlistSummaries.length ? (
          <section className="panel playlistTracksPanel">
            <div className="panelHead playlistTracksHead">
              <div className="playlistTracksTitleBlock">
                <p className="eyebrow">playlist</p>
                {selectedPlaylist && renamingPlaylistId === selectedPlaylist.id ? (
                  <form
                    className="playlistRenameForm"
                    onSubmit={(event) => {
                      event.preventDefault();
                      savePlaylistRename(selectedPlaylist.id);
                    }}
                  >
                    <input
                      value={renamingPlaylistName}
                      onChange={(event) => setRenamingPlaylistName(event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") cancelRenamePlaylist();
                      }}
                      placeholder="playlist name"
                      autoFocus
                    />
                    <button className="settingsTinyButton" type="submit"><ActionLabel icon={Check}>save</ActionLabel></button>
                    <button className="settingsTinyButton" type="button" onClick={cancelRenamePlaylist}><ActionLabel icon={X}>cancel</ActionLabel></button>
                  </form>
                ) : (
                  <h3>{selectedPlaylist ? selectedPlaylist.name : "nothing selected"}</h3>
                )}
              </div>

              {selectedPlaylist ? (
                <div className="playlistManageActions">
                  <button className="settingsTinyButton" type="button" onClick={() => startRenamePlaylist(selectedPlaylist)}><ActionLabel icon={Pencil}>rename</ActionLabel></button>
                  <button className="settingsTinyButton" type="button" onClick={() => duplicatePlaylist(selectedPlaylist.id)}><ActionLabel icon={Copy}>duplicate</ActionLabel></button>
                  <button className="settingsTinyButton danger" type="button" onClick={() => removePlaylist(selectedPlaylist.id)}><ActionLabel icon={Trash2}>remove</ActionLabel></button>
                </div>
              ) : null}
            </div>

            <VirtualPlaylistTrackList
              selectedPlaylistId={selectedPlaylist?.id || ""}
              list={selectedPlaylistSongs}
              currentId={currentId}
              isPlaying={isPlaying}
              draggedSongId={draggedSongId}
              onSelectSong={selectPlaylistSongAction}
              onStartSongDrag={startPlaylistSongDragAction}
              onDropSong={dropPlaylistSongAction}
              onAppendSong={appendPlaylistSongAction}
              onDragEnd={endPlaylistSongDragAction}
              onOpenContextMenu={openPlaylistSongContextMenuAction}
              onRemoveSong={removePlaylistSongAction}
            />
            {selectedPlaylist && !selectedPlaylist.rules && selectedPlaylistSongs.length ? (
              <PlaylistRecommendations playlist={selectedPlaylist} songs={songs} playlists={playlists} currentId={currentId} hidden={hidden}
                addSongToPlaylist={props.addSongToPlaylist} selectSong={props.dailyMixes.selectSong} />
            ) : null}
          </section>
        ) : null}
      </div>
      {smartEditing !== undefined ? (
        <Suspense fallback={null}>
          <SmartPlaylistDialog playlist={smartEditing} songs={songs} listeningCounts={props.listeningCounts}
            onSave={props.saveSmartPlaylist} onClose={() => setSmartEditing(undefined)} />
        </Suspense>
      ) : null}
      {prompting ? (
        <Suspense fallback={null}>
          <PromptPlaylistDialog songs={songs} currentId={currentId} hidden={hidden} playSongs={props.dailyMixes.playSongs}
            selectSong={props.dailyMixes.selectSong} savePlaylist={props.dailyMixes.savePlaylist}
            openAnalysisSettings={() => { setPrompting(false); props.dailyMixes.openAnalysisSettings(); }} onClose={() => setPrompting(false)} />
        </Suspense>
      ) : null}
    </section>
  );
}
