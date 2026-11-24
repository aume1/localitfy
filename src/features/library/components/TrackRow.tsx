import type { HTMLAttributes, ReactNode, Ref } from "react";
import type { Song } from "../song.types";
import { LikeHeartAnimationV443 } from "../../../shared/ui/LikeHeartAnimation";
import { PlayingBarsIcon } from "../../../shared/ui/LocaltifyViewUi";
import { SolidIcon } from "../../../shared/ui/SolidIcon";
import "./track-row.css";

type TrackRowProps = HTMLAttributes<HTMLElement> & {
  song: Song;
  active: boolean;
  playing: boolean;
  selected?: boolean;
  ref?: Ref<HTMLElement>;
};

export function TrackRow({ song, active, playing, selected, className = "", children, ...props }: TrackRowProps) {
  return <article {...props} className={`ltTrackRow ${className} ${active ? "active" : ""} ${active && playing ? "playing" : ""} ${selected ? "selected" : ""}`.trim()}
    data-track-id={song.id} data-track-missing={song.fileExists === false ? "true" : "false"}>{children}</article>;
}

export function TrackIndex({ index, active, playing, selection }: {
  index: number; active: boolean; playing: boolean; selection?: boolean;
}): ReactNode {
  return selection !== undefined ? (selection ? "✓" : "○") : active && playing ? <PlayingBarsIcon /> : index + 1;
}

export function TrackDuration({ song, formatted, className = "" }: { song: Song; formatted: string; className?: string }) {
  return <span className={`ltTrackDuration ${className}`}>{song.fileExists === false ? "Missing" : formatted}</span>;
}

export function TrackLike({ song, onLike }: { song: Song; onLike: () => unknown }) {
  const label = song.liked ? "Unlike" : "Like";
  return <button type="button" className={`iconAction likeActionV443 noActionHoverV444 ${song.liked ? "liked likeActionActiveV443" : ""}`}
    onClick={event => { event.stopPropagation(); void onLike(); }}
    aria-label={`${label} ${song.title}`} aria-pressed={song.liked} title={label}>
    <LikeHeartAnimationV443 liked={song.liked} />
  </button>;
}

export function TrackAdd({ song, onAdd, className = "" }: { song: Song; onAdd: () => unknown; className?: string }) {
  return <button type="button" className={`iconAction ${className}`}
    onPointerDown={event => event.stopPropagation()}
    onClick={event => { event.stopPropagation(); void onAdd(); }}
    aria-label={`Add ${song.title} to playlist`} title="Add to playlist">
    <SolidIcon name="add" size={16} />
  </button>;
}
