import type { ReactNode } from "react";
import { Play } from "lucide-react";
import { Cover } from "../covers/Cover";
import { prettyMeta, prettyTitle } from "../search/search.utils";
import type { Song } from "../library/song.types";
import type { LocalAlbumEntry } from "../albums/album.types";
import { useHomeDailyMixes } from "./useHomeDailyMixes";

type SectionHeadProps = { id: string; title: string; action?: ReactNode };

/** Section title with an optional small action on the right ("Play all", "See all"). */
export function HomeSectionHead({ id, title, action }: SectionHeadProps) {
  return (
    <div className="homeSectionHead">
      <h3 id={id}>{title}</h3>
      {action}
    </div>
  );
}

type SongRailProps = {
  id: string;
  title: string;
  songs: readonly Song[];
  currentId: string | null;
  selectSong: (songId: string, shouldPlay?: boolean) => unknown;
  playSongs?: (songIds: string[], label: string) => unknown;
  /** Shown when the rail is empty. Without it an empty rail is left out entirely. */
  emptyText?: string;
  className?: string;
};

/** A row of song covers. Clicking a cover plays that song; "Play all" plays the row in order. */
export function HomeSongRail({ id, title, songs, currentId, selectSong, playSongs, emptyText, className = "" }: SongRailProps) {
  const headingId = `home-${id}-title`;
  if (!songs.length) {
    return emptyText ? (
      <section className={`homeSection homeReleasesSection ${className}`} aria-labelledby={headingId}>
        <HomeSectionHead id={headingId} title={title} />
        <div className="homeShelfNotice"><span>{emptyText}</span></div>
      </section>
    ) : null;
  }
  return (
    <section className={`homeSection homeReleasesSection ${className}`} aria-labelledby={headingId}>
      <HomeSectionHead
        id={headingId}
        title={title}
        action={playSongs && songs.length > 1 ? (
          <button className="homeSectionAction" type="button" onClick={() => void playSongs(songs.map((song) => song.id), title.toLowerCase())}>
            <Play size={10} fill="currentColor" aria-hidden="true" />
            Play all
          </button>
        ) : null}
      />
      <div className="homeReleaseRail">
        {songs.map((song) => (
          <button
            key={song.id}
            className={`homeReleaseCard ${song.id === currentId ? "active" : ""}`}
            type="button"
            onClick={() => void selectSong(song.id, true)}
            title={`play ${song.title}`}
          >
            <span className="homeReleaseCoverWrap">
              <Cover song={song} className="homeReleaseCover" />
              <span className="homeReleasePlay" aria-hidden="true"><Play size={15} fill="currentColor" /></span>
            </span>
            <span className="homeReleaseCopy">
              <strong>{prettyTitle(song.title, 5)}</strong>
              <small>{prettyMeta(song.artist)}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

type AlbumRailProps = { albums: readonly LocalAlbumEntry[]; openAlbum: (albumId: string) => unknown };

/** Newest albums. Clicking one opens its album page. */
export function HomeAlbumRail({ albums, openAlbum }: AlbumRailProps) {
  if (!albums.length) return null;
  return (
    <section className="homeSection homeReleasesSection homeAlbumsSection" aria-labelledby="home-new-albums-title">
      <HomeSectionHead id="home-new-albums-title" title="New albums" />
      <div className="homeReleaseRail">
        {albums.map((album) => {
          const cover = album.coverSong ?? album.songs[0] ?? null;
          return (
            <button key={album.id} className="homeReleaseCard" type="button" onClick={() => void openAlbum(album.id)} title={`open ${album.title}`}>
              <span className="homeReleaseCoverWrap">
                {cover ? <Cover song={cover} className="homeReleaseCover" /> : null}
              </span>
              <span className="homeReleaseCopy">
                <strong>{prettyTitle(album.title, 5)}</strong>
                <small>{prettyMeta(album.albumArtist || album.artist)} · {album.trackCount} track{album.trackCount === 1 ? "" : "s"}</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

type DailyMixRailProps = {
  songsById: ReadonlyMap<string, Song>;
  playSongs: (songIds: string[], label: string) => unknown;
  openDailyMixes: () => unknown;
  openAnalysisSettings: () => unknown;
};

/** Today's daily mixes as cover collages. Clicking a mix plays it; "See all" opens the full shelf in Playlists. */
export function HomeDailyMixRail({ songsById, playSongs, openDailyMixes, openAnalysisSettings }: DailyMixRailProps) {
  const { result, failed } = useHomeDailyMixes();
  if (failed || !result) return null;
  const mixes = result.mixes
    .map((mix) => ({ ...mix, songs: mix.songIds.flatMap((id) => { const song = songsById.get(id); return song && song.fileExists !== false ? [song] : []; }) }))
    .filter((mix) => mix.songs.length);

  return (
    <section className="homeSection homeReleasesSection homeMixesSection" aria-labelledby="home-daily-mixes-title">
      <HomeSectionHead
        id="home-daily-mixes-title"
        title="Daily mixes"
        action={mixes.length ? <button className="homeSectionAction" type="button" onClick={() => void openDailyMixes()}>See all</button> : null}
      />
      {mixes.length ? (
        <div className="homeReleaseRail">
          {mixes.map((mix) => {
            const artists = [...new Set(mix.songs.map((song) => song.artist).filter(Boolean))];
            return (
              <button key={mix.id} className="homeReleaseCard" type="button" onClick={() => void playSongs(mix.songs.map((song) => song.id), mix.name)} title={`play ${mix.name}`}>
                <span className="homeReleaseCoverWrap homeMixCollage">
                  {mix.songs.slice(0, 4).map((song) => <Cover key={song.id} song={song} className="homeReleaseCover" />)}
                  <span className="homeReleasePlay" aria-hidden="true"><Play size={15} fill="currentColor" /></span>
                </span>
                <span className="homeReleaseCopy">
                  <strong>{mix.name}</strong>
                  <small>{artists.slice(0, 2).map((artist) => prettyMeta(artist)).join(", ") || `${mix.songs.length} tracks`}</small>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="homeShelfNotice">
          <span>Analyze at least five tracks and Localtify will build fresh mixes from your library every day.</span>
          <button className="homeSectionAction" type="button" onClick={() => void openAnalysisSettings()}>Open analysis settings</button>
        </div>
      )}
    </section>
  );
}
