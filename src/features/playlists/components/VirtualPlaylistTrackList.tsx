import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, MouseEvent as ReactMouseEvent } from "react";
import { startTrackPointerSession, trackReorderDirection } from "../../library/components/trackPointerSession";
import { usePageVirtualizer } from "../../../shared/hooks/usePageVirtualizer";
import { GripVertical, X } from "lucide-react";
import type { Song, LibraryDropSide } from "../../library/song.types";
import { Cover } from "../../covers/Cover";
import { MascotStateArt } from "../../../shared/ui/LocaltifyViewUi";
import { formatTime } from "../../../shared/utils/format";
import { TrackMetadata } from "../../library/TrackMetadata";
import { TrackRow, TrackIndex, TrackDuration } from "../../library/components/TrackRow";

function readPlaylistDraggedSongId(event: DragEvent<HTMLElement>, fallbackSongId = "") {
  return (
    event.dataTransfer.getData("text/localitfy-song-id") ||
    event.dataTransfer.getData("text/plain") ||
    fallbackSongId
  );
}

function getPlaylistDropSide(event: DragEvent<HTMLElement>): LibraryDropSide {
  const rect = event.currentTarget.getBoundingClientRect();
  const centerY = rect.top + rect.height / 2;
  return event.clientY < centerY ? "before" : "after";
}

export type VirtualPlaylistTrackListProps = {
  selectedPlaylistId: string;
  editable?: boolean;
  reorderable?: boolean;
  list: Song[];
  currentId: string;
  isPlaying: boolean;
  draggedSongId: string;
  onSelectSong: (songId: string) => void;
  onStartSongDrag: (event: DragEvent<HTMLElement>, songId: string) => void;
  onDropSong: (playlistId: string, draggedSongId: string, targetSongId: string, side: LibraryDropSide) => void;
  onAppendSong: (playlistId: string, draggedSongId: string) => void;
  onDragEnd: () => void;
  onOpenContextMenu: (event: ReactMouseEvent<HTMLElement>, song: Song) => void;
  onRemoveSong: (playlistId: string, songId: string) => void;
};

export const VirtualPlaylistTrackList = memo(function VirtualPlaylistTrackList({
  selectedPlaylistId,
  editable = true,
  reorderable = editable,
  list,
  currentId,
  isPlaying,
  draggedSongId,
  onSelectSong,
  onStartSongDrag,
  onDropSong,
  onAppendSong,
  onDragEnd,
  onOpenContextMenu,
  onRemoveSong
}: VirtualPlaylistTrackListProps) {
  const songIds = useMemo(() => new Set(list.map(song => song.id)), [list]);
  const [dropTarget, setDropTarget] = useState<{ songId: string; side: LibraryDropSide } | null>(null);
  const [pointerSong, setPointerSong] = useState("");
  const pointer = useRef<(() => void) | null>(null);
  const { listRef, virtualizer: rowVirtualizer, scrollMargin } = usePageVirtualizer<HTMLDivElement>({
    count: list.length,
    estimateSize: () => 72,
    overscan: 5,
    getItemKey: (index) => `${selectedPlaylistId}-${list[index]?.id || index}`
  });

  useEffect(() => {
    setPointerSong(""); setDropTarget(null);
    return () => pointer.current?.();
  }, [selectedPlaylistId, reorderable]);

  function pointerTarget(clientX: number, clientY: number, source: string) {
    const row = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>(".playlistTrackRow[data-track-id]");
    const id = row?.dataset.trackId;
    if (!row || !id || id === source || !songIds.has(id)) return null;
    const rect = row.getBoundingClientRect();
    return { songId: id, side: (clientY < rect.top + rect.height / 2 ? "before" : "after") as LibraryDropSide };
  }

  const clearLocalDropTarget = useCallback(() => {
    setDropTarget((current) => (current ? null : current));
  }, []);

  const handleEmptyDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    const songId = readPlaylistDraggedSongId(event, draggedSongId);
    if (!reorderable || !selectedPlaylistId || !songId) return;

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  }, [draggedSongId, selectedPlaylistId, reorderable]);

  const handleEmptyDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    const songId = readPlaylistDraggedSongId(event, draggedSongId);
    if (!reorderable || !selectedPlaylistId || !songId) return;

    event.preventDefault();
    event.stopPropagation();
    onAppendSong(selectedPlaylistId, songId);
    clearLocalDropTarget();
    onDragEnd();
  }, [clearLocalDropTarget, draggedSongId, onAppendSong, onDragEnd, selectedPlaylistId, reorderable]);

  if (!selectedPlaylistId || !list.length) {
    return (
      <div
        className={`playlistEmptyState playlistMascotEmptyV496 ${selectedPlaylistId ? "playlistDropEmpty" : ""}`}
        onDragOver={handleEmptyDragOver}
        onDrop={handleEmptyDrop}
      >
        <MascotStateArt state={selectedPlaylistId ? "question" : "empty"} className="playlistEmptyMascotV496" />
        <span className="mascotEmptyCopyV496">
          <strong>{selectedPlaylistId ? "This playlist is empty" : "Choose a playlist"}</strong>
          <p>{selectedPlaylistId ? "Drop a song here, or use the + button on any song to add music." : "Your playlist songs will show up here."}</p>
        </span>
      </div>
    );
  }

  return (
    <div ref={listRef} className="playlistTrackList virtualPlaylistTrackList" aria-label="playlist songs">
      <div className="virtualPlaylistTrackCanvas" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const song = list[virtualRow.index];
          if (!song) return null;

          const active = song.id === currentId;
          const isDragging = draggedSongId === song.id || pointerSong === song.id;
          const isDropTarget = dropTarget?.songId === song.id && draggedSongId !== song.id && pointerSong !== song.id;

          return (
            <TrackRow song={song} active={active} playing={isPlaying}
              key={virtualRow.key}
              ref={rowVirtualizer.measureElement}
              data-index={virtualRow.index}
              className={`playlistTrackRow virtualPlaylistTrackRow ${isDragging ? "songDragging" : ""} ${isDropTarget ? "songDropTarget" : ""}`}
              data-drop-side={isDropTarget ? dropTarget?.side : undefined}
              style={{
                "--playlist-row-y": `${virtualRow.start - scrollMargin}px`,
                "--playlist-stagger": Math.min(virtualRow.index, 12)
              } as CSSProperties}
              tabIndex={reorderable && song.fileExists === false ? 0 : undefined}
              aria-label={song.fileExists === false ? `${song.title}, missing local file` : undefined}
              aria-keyshortcuts={reorderable ? "Alt+ArrowUp Alt+ArrowDown" : undefined}
              draggable={reorderable}
              onKeyDown={event => {
                const direction = trackReorderDirection(event);
                if (!reorderable || direction === null) return;
                event.preventDefault(); event.stopPropagation();
                const target = list[virtualRow.index + direction];
                if (target) onDropSong(selectedPlaylistId, song.id, target.id, direction < 0 ? "before" : "after");
              }}
              onDragStart={(event) => onStartSongDrag(event, song.id)}
              onDragOver={(event) => {
                const incomingSongId = readPlaylistDraggedSongId(event, draggedSongId);
                if (!reorderable || !incomingSongId || incomingSongId === song.id) return;

                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = songIds.has(incomingSongId) ? "move" : "copy";

                const side = getPlaylistDropSide(event);
                setDropTarget((current) => (
                  current?.songId === song.id && current.side === side
                    ? current
                    : { songId: song.id, side }
                ));
              }}
              onDragLeave={(event) => {
                const nextTarget = event.relatedTarget;
                if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
                setDropTarget((current) => (current?.songId === song.id ? null : current));
              }}
              onDrop={(event) => {
                const incomingSongId = readPlaylistDraggedSongId(event, draggedSongId);
                if (!reorderable || !incomingSongId || incomingSongId === song.id) return;

                event.preventDefault();
                event.stopPropagation();
                const side = getPlaylistDropSide(event);
                onDropSong(selectedPlaylistId, incomingSongId, song.id, side);
                clearLocalDropTarget();
                onDragEnd();
              }}
              onDragEnd={() => {
                clearLocalDropTarget();
                onDragEnd();
              }}
              onContextMenu={(event) => onOpenContextMenu(event, song)}
            >
              <span className="playlistTrackGrip" aria-hidden="true"
                onPointerDown={event => {
                  if (!reorderable || !["touch", "pen"].includes(event.pointerType) || pointer.current) return;
                  event.preventDefault(); event.stopPropagation();
                  setPointerSong(song.id);
                  pointer.current = startTrackPointerSession(event, {
                    move: (x, y) => {
                      const next = pointerTarget(x, y, song.id);
                      setDropTarget(current => current?.songId === next?.songId && current?.side === next?.side ? current : next);
                    },
                    finish: (apply, x, y) => {
                      pointer.current = null;
                      const target = apply ? pointerTarget(x, y, song.id) : null;
                      if (target) onDropSong(selectedPlaylistId, song.id, target.songId, target.side);
                      setPointerSong(""); setDropTarget(null);
                    }
                  });
                }}>{reorderable ? <GripVertical size={14} strokeWidth={2.25} /> : null}</span>
              <button className="playlistTrackMain" type="button" disabled={song.fileExists === false} aria-current={active ? "true" : undefined} aria-keyshortcuts={reorderable ? "Alt+ArrowUp Alt+ArrowDown" : undefined} title={song.fileExists === false ? "Missing local file" : reorderable ? "Play · Alt + ↑/↓ to reorder" : "Play"} onClick={() => onSelectSong(song.id)}>
                <span className="playlistTrackIndex"><TrackIndex index={virtualRow.index} active={active} playing={isPlaying} /></span>
                <Cover song={song} className="playlistTrackCover" preferThumbnail />
                <TrackMetadata song={song} className="playlistTrackText ltTrackMetadata" subtitle={song.fileExists === false ? "Missing local file" : undefined} />
              </button>
              <TrackDuration song={song} formatted={formatTime(song.duration)} className="playlistTrackDuration" />
              <button className="iconAction iconActionSvg" type="button" disabled={!editable} onClick={() => onRemoveSong(selectedPlaylistId, song.id)} aria-label={`Remove ${song.title} from playlist`}>
                <X size={16} strokeWidth={2.5} />
              </button>
            </TrackRow>
          );
        })}
      </div>
    </div>
  );
});
