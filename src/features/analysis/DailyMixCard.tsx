// Adapted from tryliner/desktop src/features/home/ui/DailyMixCard.tsx (54eaab9).
// Copyright (c) 2024-2026 Liner Project Contributors & feralbureau.
// Reused under the separate authorization reported by Localtify's maintainer.
import { memo } from "react";
import type { DailyMix } from "./analysis.types";
import type { Song } from "../library/song.types";
import { MixCoverArtwork } from "../covers/MixCoverArtwork";
import { MediaCard } from "../../shared/ui/MediaCard";
import { MetaDividerDot } from "../../shared/ui/LocaltifyViewUi";
import { formatTime } from "../../shared/utils/format";
import { mixTarget, useAppActions } from "../shell/appActions";

/** One cover-first card, with Localtify's local artwork and play/menu actions. */
function DailyMixCard({ mix, songs, target, artists, home = false }: {
  mix: DailyMix; songs: Song[]; target: ReturnType<typeof mixTarget>; artists: string; home?: boolean;
}) {
  const actions = useAppActions();
  return <MediaCard className={home ? "homeReleaseCard" : "playlistShelfCard dailyMixCard"}
    coverClassName={home ? undefined : "mediaCardPlayCentered"}
    openLabel={`open ${mix.name}`} playLabel={`play ${mix.name}`}
    onOpen={() => actions.openCollection(target)} onPlay={() => actions.playCollection(target)}
    onContextMenu={event => actions.openCollectionMenu(event, target)}
    cover={<MixCoverArtwork songs={songs} className={home ? "homeReleaseCoverWrap" : undefined} />}>
    {home ? <span className="homeReleaseCopy"><strong>{mix.name}</strong><small>{artists}</small></span> :
      <span className="playlistShelfMeta"><strong>{mix.name}</strong>
        <span className="dailyMixArtists">{artists}</span>
        <small>{songs.length} song{songs.length === 1 ? "" : "s"}<MetaDividerDot/>{formatTime(songs.reduce((sum, song) => sum + (song.duration || 0), 0))}</small>
      </span>}
  </MediaCard>;
}
export default memo(DailyMixCard);
