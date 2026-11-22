import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { ListEnd, MoreHorizontal, Play, Shuffle } from "lucide-react";
import type { Song } from "../library/song.types";
import type { LibrarySortMode } from "../library/librarySort";
import { IconButton } from "../../shared/ui/IconButton";
import { EntityHero, HeroMeta } from "../../shared/ui/EntityHero";
import Button from "../../shared/ui/Button";

export type CollectionHeroProps = {
  typeLabel: string;
  title: string;
  cover: ReactNode;
  coverSong: Song | null;
  round?: boolean;
  /** Artist links, owner, rule summary… */
  byline?: ReactNode;
  stats: string;
  playable: number;
  onPlay: () => unknown;
  onShuffle: () => unknown;
  onQueue: () => unknown;
  onMore: (event: ReactMouseEvent<HTMLElement>) => unknown;
  /** Page-specific buttons after the shared ones (edit, more like this…). */
  children?: ReactNode;
  search?: ReactNode;
  sort?: {value: LibrarySortMode; onChange: (value: LibrarySortMode) => void; defaultLabel?: string};
};

/** Top of every album, artist, genre, playlist and mix page: artwork, title, then play · shuffle · queue · more. */
export default function CollectionHero({ typeLabel, title, cover, round = false, byline, stats, playable, onPlay, onShuffle, onQueue, onMore, children, search, sort }: CollectionHeroProps) {
  return (
    <EntityHero cover={cover} round={round} title={<h1 title={title}>{title}</h1>}
      subtitle={byline} meta={<HeroMeta items={[typeLabel, stats]}/>} actions={<>
        <Button className="collectionPlayButton" size="sm" type="button" onClick={() => void onPlay()} disabled={!playable} aria-label={`play ${title}`} title="Play">
          <Play size={16} fill="currentColor" strokeWidth={2} aria-hidden="true" />
          <span>Play all</span>
        </Button>
        <IconButton className="collectionIconButton" type="button" onClick={() => void onShuffle()} disabled={playable < 2} aria-label={`shuffle ${title}`} title="Shuffle">
          <Shuffle size={17} strokeWidth={2.2} aria-hidden="true" />
        </IconButton>
        <IconButton className="collectionIconButton" type="button" onClick={() => void onQueue()} disabled={!playable} aria-label={`add ${title} to queue`} title="Add to queue">
          <ListEnd size={17} strokeWidth={2.2} aria-hidden="true" />
        </IconButton>
        {search ? <div className="collectionHeroSearch">{search}</div> : null}
        {sort ? <select className="pageHeaderSearch collectionSort" aria-label="Sort collection tracks" value={sort.value} onChange={event=>sort.onChange(event.currentTarget.value as LibrarySortMode)}>
          <option value="library">{sort.defaultLabel || "Default order"}</option>
          <option value="title">Title</option><option value="artist">Artist</option>
          <option value="recent">Recently added</option><option value="plays">Most played</option>
        </select> : null}
        {children}
        <IconButton className="collectionIconButton" type="button" onClick={(event) => void onMore(event)} aria-label={`more options for ${title}`} title="More options">
          <MoreHorizontal size={18} strokeWidth={2.2} aria-hidden="true" />
        </IconButton>
      </>} />
  );
}
