import { usePageVirtualizer } from "../../shared/hooks/usePageVirtualizer";
import { Fragment, useCallback } from "react";
import { SolidIcon } from "../../shared/ui/SolidIcon";
import { TrackRow, TrackIndex, TrackLike, TrackAdd, TrackDuration } from "../library/components/TrackRow";
import { Cover } from "../covers/Cover";
import { formatTime } from "../../shared/utils/format";
import { prettyMeta } from "../search/search.utils";
import { TrackMetadata } from "../library/TrackMetadata";
import { splitArtistCredits } from "../artists/artistCredits";
import { useAppActions } from "../shell/appActions";
import type { Song } from "../library/song.types";

export type TrackListProps = {
  songs: readonly Song[];
  currentId: string | null;
  isPlaying: boolean;
  /** Plays the page's collection starting at this song. */
  playFrom: (songId: string) => unknown;
  toggleLike: (songId: string) => unknown;
  openPlaylistPicker: (song: Song) => unknown;
  showCover?: boolean;
  /** Artist page: its own name is not repeated as a link on every row. */
  hideArtist?: string;
};

/**
 * Songs on a collection page. Clicking a row plays from it; right-click opens the song menu.
 */
export default function TrackList({ songs, currentId, isPlaying, playFrom, toggleLike, openPlaylistPicker, showCover = true, hideArtist }: TrackListProps) {
  const { nav, openSongMenu } = useAppActions();
  const hidden = hideArtist?.toLocaleLowerCase();
  const windowed = songs.length > 80;
  const getItemKey = useCallback((index: number) => songs[index].id, [songs]);
  const { listRef, virtualizer, scrollMargin } = usePageVirtualizer<HTMLDivElement>({
    count: windowed ? songs.length : 0,
    estimateSize: () => 64,
    overscan: 6,
    getItemKey
  });
  const renderRow = (song: Song, index: number) => {
    const active = song.id === currentId;
    const missing = song.fileExists === false;
    const credits = splitArtistCredits(song.artist);
    const shown = hidden && credits.length > 1 ? credits.filter((name) => name.toLocaleLowerCase() !== hidden) : credits;
    return (
      <TrackRow key={song.id} song={song} active={active} playing={isPlaying} role="listitem" aria-posinset={index + 1} aria-setsize={songs.length} aria-current={active ? "true" : undefined} className={`trackRow ${missing ? "missing" : ""}`}
        title={missing ? "Local audio file missing" : undefined}
        onClick={() => { if (!missing) void playFrom(song.id); }}
        onContextMenu={(event) => void openSongMenu(event, song)}>
        <button className="trackRowIndex" type="button" disabled={missing} aria-label={`play ${song.title}`}
          onClick={(event) => { event.stopPropagation(); void playFrom(song.id); }}>
          <span className="trackRowNumber"><TrackIndex index={index} active={active} playing={isPlaying} /></span>
          <SolidIcon name="play" className="trackRowPlayIcon" size={15} />
        </button>
        {showCover ? <Cover song={song} className="trackRowCover" preferThumbnail /> : null}
        <TrackMetadata song={song} className="trackRowTitle ltTrackMetadata" maxWords={10} subtitle={shown.length ? shown.map((name, at) => (
              <Fragment key={name}>
                {at ? ", " : null}
                <button className="trackLink" type="button" onClick={(event) => { event.stopPropagation(); nav.openArtistPage(name); }}>{prettyMeta(name)}</button>
              </Fragment>
            )) : prettyMeta(song.artist || "unknown artist")} />
        <TrackLike song={song} onLike={() => toggleLike(song.id)} />
        <TrackDuration song={song} formatted={formatTime(song.duration)} className="trackRowDuration" />
        <TrackAdd song={song} className="trackRowAdd" onAdd={() => openPlaylistPicker(song)} />
      </TrackRow>
    );
  };
  return (
    <div ref={listRef} className={`trackList ${showCover ? "withCover" : ""}`} role="list" aria-label="Tracks">
      {windowed ? (
        <div className="trackListCanvas" role="presentation" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((row) => (
            <div key={row.key} ref={virtualizer.measureElement} data-index={row.index} className="trackVirtualRow" role="presentation"
              style={{ top: row.start - scrollMargin }}>
              {renderRow(songs[row.index], row.index)}
            </div>
          ))}
        </div>
      ) : songs.map(renderRow)}
    </div>
  );
}
