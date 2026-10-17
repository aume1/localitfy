import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Play, Plus, RefreshCw, X } from "lucide-react";
import { Cover } from "../covers/Cover";
import type { Song } from "../library/song.types";
import { prettyMeta, prettyTitle } from "../search";
import { formatTime } from "../../shared/utils/format";
import type { SimilarSongsResult } from "./analysis.types";
import "./similar-songs.css";

export type SimilarSongsDialogProps = {
  seed: Song | null;
  songsById: Map<string, Song>;
  currentId: string;
  returnFocusTo?: HTMLElement | null;
  onClose: () => void;
  openAnalysisSettings: () => void;
  selectSong: (id: string, autoplay?: boolean) => unknown;
  queueSong: (id: string) => unknown;
  playSongs: (ids: string[], label: string) => unknown;
  queueSongs: (ids: string[], label: string) => unknown;
};

const seedMessages: Record<Exclude<SimilarSongsResult["status"], "ready">, string> = {
  "seed-unavailable": "This song is no longer in your library.",
  "seed-missing": "This song’s audio file is missing. Restore the file before finding similar songs.",
  "seed-unanalyzed": "Analyze this song first, along with a few other tracks, to find audio matches.",
  "seed-stale": "This song changed or its audio profile is outdated. Analyze it again to find matches."
};

export default function SimilarSongsDialog({ seed, songsById, currentId, returnFocusTo, onClose, openAnalysisSettings,
  selectSong, queueSong, playSongs, queueSongs }: SimilarSongsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [result, setResult] = useState<SimilarSongsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const seedId = seed?.id;

  useLayoutEffect(() => {
    if (!seedId) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    dialog?.showModal();
    closeRef.current?.focus();
    return () => {
      if (dialog?.open) dialog.close();
      const target = returnFocusTo?.isConnected ? returnFocusTo : previousFocus?.isConnected ? previousFocus : null;
      if (target) {
        const temporaryTabIndex = target.tabIndex < 0 && !target.hasAttribute("tabindex");
        if (temporaryTabIndex) target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
        if (temporaryTabIndex) target.removeAttribute("tabindex");
      }
    };
  }, [seedId, returnFocusTo]);

  useEffect(() => {
    if (!seedId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setResult(null);
    void window.localitfy.findSimilarSongs({ songId: seedId, limit: 30 }).then((next) => {
      if (!cancelled && next.seedId === seedId) setResult(next);
    }).catch(() => {
      if (!cancelled) setError("Could not load similar songs. Please retry. If this keeps happening, rerun library analysis.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [seedId, attempt]);

  const matches = useMemo(() => (result?.status === "ready" ? result.matches : []).flatMap((match) => {
    const song = songsById.get(match.songId);
    return song && song.id !== seedId && song.fileExists !== false ? [song] : [];
  }), [result, songsById, seedId]);
  if (!seed) return null;
  const ids = matches.map((song) => song.id);

  return <dialog ref={dialogRef} className="similarSongsDialog" aria-labelledby="similar-songs-title" aria-modal="true"
    onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="similarSongsContent">
      <header className="similarSongsHeader">
        <Cover song={seed} className="similarSongsSeedCover" />
        <div className="similarSongsHeading"><p className="similarSongsEyebrow">From your library</p><h2 id="similar-songs-title">Similar songs</h2><p className="similarSongsSeedTitle">{prettyTitle(seed.title)} · {prettyMeta(seed.artist)}</p></div>
        <button ref={closeRef} type="button" className="similarSongsClose" onClick={onClose} aria-label="Close similar songs"><X size={20} /></button>
      </header>
      <p className="similarSongsIntro">Closest matches by sound, using saved audio analysis. All comparisons stay on your device.</p>
      {loading ? <p className="similarSongsNotice" role="status">Comparing analyzed tracks…</p> : null}
      {error ? <div className="similarSongsNotice" role="alert"><p>{error}</p><button type="button" className="similarSongsAction" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={15} />Retry</button></div> : null}
      {result && result.status !== "ready" ? <p className="similarSongsNotice" role="status">{seedMessages[result.status]}</p> : null}
      {result?.status === "ready" && !matches.length ? <p className="similarSongsNotice" role="status">No playable audio matches yet. Analyze more tracks, then try again.</p> : null}
      {result?.status === "ready" && matches.length > 0 ? <>
        <div className="similarSongsToolbar"><span>{matches.length} matches · {result.compared} tracks compared</span><div>
          <button type="button" className="similarSongsAction similarSongsPrimary" title="Play these matches as a new queue" onClick={() => playSongs(ids, "similar songs")}><Play size={15} />Play matches</button>
          <button type="button" className="similarSongsAction" onClick={() => queueSongs(ids, "similar songs")}><Plus size={15} />Queue matches</button>
        </div></div>
        <ol className="similarSongsList">{matches.map((song) => <li key={song.id} className="similarSongsRow" data-current={currentId === song.id}>
          <Cover song={song} className="similarSongsRowCover" />
          <div className="similarSongsTrack"><strong title={song.title}>{prettyTitle(song.title)}</strong><span>{prettyMeta(song.artist)} · {prettyMeta(song.album)}</span></div>
          <span className="similarSongsDuration">{formatTime(song.duration)}</span>
          <button type="button" className="similarSongsIconButton" aria-label={`Play ${song.title}`} onClick={() => void selectSong(song.id, true)}><Play size={17} /></button>
          <button type="button" className="similarSongsIconButton" aria-label={`Queue ${song.title}`} onClick={() => queueSong(song.id)}><Plus size={17} /></button>
        </li>)}</ol>
      </> : null}
      <footer className="similarSongsFooter"><span>Only tracks with current audio profiles can appear here.</span><button type="button" className="similarSongsAction" onClick={openAnalysisSettings}>Open analysis settings</button></footer>
    </section>
  </dialog>;
}
