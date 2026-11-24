import { trackReorderDirection } from "./trackPointerSession";
import { memo } from "react";
import { TrackRow, TrackIndex, TrackLike, TrackAdd, TrackDuration } from "./TrackRow";
import { GripVertical } from "lucide-react";
import type { CSSProperties, DragEvent, MouseEvent as ReactMouseEvent, PointerEvent } from "react";
import { usePageVirtualizer } from "../../../shared/hooks/usePageVirtualizer";
import type { Song, LibraryDropSide } from "../song.types";
import { Cover } from "../../covers/Cover";
import { MascotStateArt } from "../../../shared/ui/LocaltifyViewUi";
import { formatTime } from "../../../shared/utils/format";
import { TrackMetadata } from "../TrackMetadata";

export type SongInteractionHandlers = {
  onSelectSong: (songId: string, shouldPlay?: boolean) => void;
  onToggleLike: (songId: string) => void;
  onOpenPlaylistPicker: (song: Song) => void;
  onOpenSongContextMenu?: (event: ReactMouseEvent<HTMLElement>, song: Song) => void;
  onStartSongDrag: (event: DragEvent<HTMLElement>, songId: string) => void;
  onPointerStartSongDrag?: (event: PointerEvent<HTMLElement>, songId: string) => void;
  onMoveSong?: (songId: string, targetId: string, side: LibraryDropSide) => void;
  registerLibrarySongElement?: (songId: string, element: HTMLElement | null) => void;
  onDragOverSong: (event: DragEvent<HTMLElement>, songId: string) => void;
  onDragLeaveSong: (event: DragEvent<HTMLElement>, songId: string) => void;
  onDropSong: (event: DragEvent<HTMLElement>, songId: string) => void;
  onDragEnd: () => void;
};

export type SongRowItemProps = SongInteractionHandlers & {
  song: Song;
  index: number;
  active: boolean;
  isPlaying: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  libraryDropSide: LibraryDropSide;
  draggedSongTitle: string;
  selected?: boolean;
  onToggleSelection?: (id: string) => void;
  moveAdjacent?: (direction: -1 | 1) => void;
};


export const SongRowItem = memo(function SongRowItem({
  song,
  index,
  active,
  isPlaying,
  isDragging,
  isDropTarget,
  libraryDropSide,
  draggedSongTitle,
  selected,
  onToggleSelection,
  moveAdjacent,
  onSelectSong,
  onToggleLike,
  onOpenPlaylistPicker,
  onOpenSongContextMenu,
  onStartSongDrag,
  onPointerStartSongDrag,
  registerLibrarySongElement,
  onDragOverSong,
  onDragLeaveSong,
  onDropSong,
  onDragEnd
}: SongRowItemProps) {
  const isMissingFile = song.fileExists === false;

  return (
    <TrackRow song={song} active={active} playing={isPlaying} selected={selected}
      tabIndex={moveAdjacent && isMissingFile && !onToggleSelection ? 0 : undefined}
      aria-label={isMissingFile ? `${song.title}, missing local file` : undefined}
      aria-keyshortcuts={moveAdjacent && !onToggleSelection ? "Alt+ArrowUp Alt+ArrowDown" : undefined}
      ref={(element) => registerLibrarySongElement?.(song.id, element)}
      className={`songRow ${isDragging ? "songDragging" : ""} ${isDropTarget ? "songDropTarget" : ""} ${isMissingFile ? "songMissingFileV039" : ""}`}
      data-library-song-id={song.id}
      data-file-exists={isMissingFile ? "false" : "true"}
      data-drop-side={isDropTarget ? libraryDropSide : undefined}
      draggable={!onToggleSelection}
      onPointerDown={(event) => {
        if (onToggleSelection || (event.pointerType !== "touch" && event.pointerType !== "pen")) return;
        if (!(event.target instanceof Element) || !event.target.closest(".songRowDragHandle")) return;
        onPointerStartSongDrag?.(event, song.id);
      }}
      onKeyDown={event => {
        const direction = trackReorderDirection(event);
        if (!moveAdjacent || onToggleSelection || direction === null) return;
        event.preventDefault(); event.stopPropagation();
        moveAdjacent(direction);
      }}
      onDragStart={(event) => onStartSongDrag(event, song.id)}
      onDragOver={(event) => onDragOverSong(event, song.id)}
      onDragLeave={(event) => onDragLeaveSong(event, song.id)}
      onDrop={(event) => onDropSong(event, song.id)}
      onDragEnd={onDragEnd}
      onContextMenu={(event) => onOpenSongContextMenu?.(event, song)}
      title={isMissingFile ? "Local audio file missing" : draggedSongTitle ? `dragging ${draggedSongTitle}` : undefined}
      style={{ "--stagger": `${Math.min(index, 20) * 18}ms` } as CSSProperties}
    >
      {!onToggleSelection && onPointerStartSongDrag ? <span className="songRowDragHandle" aria-hidden="true"><GripVertical size={14} strokeWidth={2} /></span> : null}
      <button className="songButton" type="button" disabled={isMissingFile && !onToggleSelection} aria-pressed={onToggleSelection ? Boolean(selected) : undefined} aria-current={!onToggleSelection && active ? "true" : undefined} aria-keyshortcuts={moveAdjacent && !onToggleSelection ? "Alt+ArrowUp Alt+ArrowDown" : undefined} aria-label={`${onToggleSelection ? (selected ? "Deselect" : "Select") : "Play"} ${song.title}`} onClick={() => onToggleSelection ? onToggleSelection(song.id) : onSelectSong(song.id, true)}>
        <span className="songIndex"><TrackIndex index={index} active={active} playing={isPlaying} selection={onToggleSelection ? Boolean(selected) : undefined} /></span>

        <Cover song={song} className="songArt" />

        <TrackMetadata song={song} className="songMeta ltTrackMetadata" subtitle={isMissingFile ? "missing local file · reimport or relink" : undefined} />
      </button>

      <TrackDuration song={song} formatted={formatTime(song.duration)} className="songInfo songDurationInfo" />

      <TrackLike song={song} onLike={() => onToggleLike(song.id)} />
      <TrackAdd song={song} className="playlistAddAction noActionHoverV444" onAdd={() => onOpenPlaylistPicker(song)} />

    </TrackRow>
  );
});

export type VirtualSongRowsProps = SongInteractionHandlers & {
  list: Song[];
  className: string;
  currentId: string;
  isPlaying: boolean;
  draggedSongId: string;
  libraryDragOverSongId: string;
  libraryDropSide: LibraryDropSide;
  draggedSongTitle: string;
  selectedIds?: ReadonlySet<string>;
  onToggleSelection?: (id: string) => void;
  onAreaDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onAreaDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onAreaDrop: (event: DragEvent<HTMLDivElement>) => void;
};

export const VirtualSongRows = memo(function VirtualSongRows({
  list,
  className,
  currentId,
  isPlaying,
  draggedSongId,
  libraryDragOverSongId,
  libraryDropSide,
  draggedSongTitle,
  selectedIds,
  onToggleSelection,
  onAreaDragOver,
  onAreaDragLeave,
  onAreaDrop,
  onSelectSong,
  onToggleLike,
  onOpenPlaylistPicker,
  onOpenSongContextMenu,
  onStartSongDrag,
  onPointerStartSongDrag,
  onMoveSong,
  registerLibrarySongElement,
  onDragOverSong,
  onDragLeaveSong,
  onDropSong,
  onDragEnd
}: VirtualSongRowsProps) {
  const { listRef, virtualizer: rowVirtualizer, scrollMargin } = usePageVirtualizer<HTMLDivElement>({
    count: list.length,
    estimateSize: () => 74,
    overscan: 5,
    getItemKey: (index) => list[index]?.id || index
  });

  if (!list.length) {
    return (
      <div
        className={className}
        onDragOver={onAreaDragOver}
        onDragLeave={onAreaDragLeave}
        onDrop={onAreaDrop}
      >
        <div className="emptyState mascotEmptyStateV496">
          <MascotStateArt state="empty" className="emptyStateMascotV496" />
          <span className="mascotEmptyCopyV496">
            <strong>import songs to fill this area</strong>
            <p>import some music and this area will wake up.</p>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className={`${className} virtualSongViewport virtualSongRowsViewport`}
      onDragOver={onAreaDragOver}
      onDragLeave={onAreaDragLeave}
      onDrop={onAreaDrop}
      data-virtual-count={list.length}
    >
      <div
        className="virtualSongCanvas"
        style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const song = list[virtualRow.index];
          if (!song) return null;

          const active = song.id === currentId;
          const isDragging = draggedSongId === song.id;
          const isDropTarget = Boolean(draggedSongId && draggedSongId !== song.id && libraryDragOverSongId === song.id);

          return (
            <div
              key={virtualRow.key}
              ref={rowVirtualizer.measureElement}
              data-index={virtualRow.index}
              className="virtualSongItem"
              style={{ transform: `translateY(${virtualRow.start - scrollMargin}px)` }}
            >
              <SongRowItem
                song={song}
                selected={selectedIds?.has(song.id)}
                onToggleSelection={onToggleSelection}
                moveAdjacent={onMoveSong ? direction => {
                  const target = list[virtualRow.index + direction];
                  if (target) onMoveSong(song.id, target.id, direction < 0 ? "before" : "after");
                } : undefined}
                index={virtualRow.index}
                active={active}
                isPlaying={isPlaying}
                isDragging={isDragging}
                isDropTarget={isDropTarget}
                libraryDropSide={libraryDropSide}
                draggedSongTitle={draggedSongTitle}
                onSelectSong={onSelectSong}
                onToggleLike={onToggleLike}
                onOpenPlaylistPicker={onOpenPlaylistPicker}
                onOpenSongContextMenu={onOpenSongContextMenu}
                onStartSongDrag={onStartSongDrag}
                onPointerStartSongDrag={onPointerStartSongDrag}
                registerLibrarySongElement={registerLibrarySongElement}
                onDragOverSong={onDragOverSong}
                onDragLeaveSong={onDragLeaveSong}
                onDropSong={onDropSong}
                onDragEnd={onDragEnd}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});

