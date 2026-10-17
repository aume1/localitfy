import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, Plus, RefreshCw, Save, ChevronDown } from "lucide-react";
import type { Song } from "../library/song.types";
import type { DailyMix, DailyMixesResult } from "./analysis.types";
import PlaylistCoverCollage from "../playlists/components/PlaylistCoverCollage";
import { formatTime } from "../../shared/utils/format";
import { prettyMeta, prettyTitle } from "../search";
import "./daily-mixes.css";

export type DailyMixesShelfProps = {
  songs: Song[];
  currentId: string;
  playSongs: (ids: string[], label: string) => unknown;
  queueSongs: (ids: string[], label: string) => unknown;
  selectSong: (id: string, autoplay?: boolean) => unknown;
  queueSong: (id: string) => unknown;
  savePlaylist: (name: string, ids: string[]) => string | null;
  openAnalysisSettings: () => void;
};
function day() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

export default function DailyMixesShelf(props: DailyMixesShelfProps) {
  const [result, setResult] = useState<DailyMixesResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef(0);
  const loadingRef = useRef(false);
  const songsById = useMemo(() => new Map(props.songs.map((song) => [song.id, song])), [props.songs]);
  const load = useCallback(async (refresh = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const request = ++requestRef.current;
    setLoading(true); setError("");
    try {
      const next = await window.localitfy.getDailyMixes({ refresh });
      if (request === requestRef.current) setResult(next);
    } catch {
      if (request === requestRef.current) setError("Could not generate your mixes. Please retry.");
    } finally {
      if (request === requestRef.current) { loadingRef.current = false; setLoading(false); }
    }
  }, []);
  useEffect(() => {
    void load();
    return () => { requestRef.current++; loadingRef.current = false; };
  }, [load]);
  useEffect(() => {
    const check = () => { if (result?.day !== day()) void load(); };
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timer = window.setTimeout(check, midnight.getTime() - now.getTime() + 1000);
    window.addEventListener("focus", check);
    return () => { window.clearTimeout(timer); window.removeEventListener("focus", check); };
  }, [load, result]);

  return <section className="dailyMixes" aria-labelledby="daily-mixes-title" aria-busy={loading}>
    <header className="dailyMixesHeader"><div><p className="dailyMixesEyebrow">Made from your library</p><h3 id="daily-mixes-title">Your daily mixes</h3>
      <p>Familiar sounds, a fresh selection each day. Built on your device from saved audio analysis.</p></div>
      <button type="button" className="softButton dailyMixesRefresh" disabled={loading} onClick={() => void load(true)}><RefreshCw size={15} />{loading ? "Building mixes…" : "Refresh mixes"}</button></header>
    {error ? <p className="dailyMixesNotice" role="alert">{error} <button type="button" className="softButton" disabled={loading} onClick={() => void load()}>Retry</button></p> : null}
    {loading && !result ? <p className="dailyMixesNotice" role="status">Finding groups of similar sounds…</p> : null}
    {result && !result.mixes.length ? <div className="dailyMixesNotice"><p>Analyze at least five playable tracks to make your first mix. More analyzed music gives you more variety.</p><button type="button" className="softButton" onClick={props.openAnalysisSettings}>Open analysis settings</button></div> : null}
    {result?.mixes.length ? <>
      <div className="dailyMixesGrid">{result.mixes.map((mix) => <MixCard key={`${result.day}:${result.edition}:${mix.id}`} mix={mix} day={result.day} songsById={songsById} actions={props} />)}</div>
      <p className="dailyMixesFootnote">{result.eligible} analyzed tracks available · {result.day} · Up to 25 tracks per mix. Refreshing leaves saved playlists intact.</p>
    </> : null}
  </section>;
}
function MixCard({ mix, day: date, songsById, actions }: {
  mix: DailyMix; day: string; songsById: Map<string, Song>; actions: DailyMixesShelfProps;
}) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(`${mix.name} · ${date}`);
  const [saved, setSaved] = useState(false);
  const songs = mix.songIds.flatMap((id) => { const song = songsById.get(id); return song && song.fileExists !== false ? [song] : []; });
  const ids = songs.map((song) => song.id);
  const artists = [...new Set(songs.map((song) => song.artist).filter(Boolean))];
  const previewId = `mix-preview-${mix.id}`;
  return <article className="dailyMixCard">
    <div className="dailyMixCardTop"><PlaylistCoverCollage songs={songs} className="playlistCoverCollage dailyMixCover" /><div>
      <h4>{mix.name}</h4><p>{artists.slice(0, 3).map((artist) => prettyMeta(artist)).join(", ") || "Your analyzed music"}{artists.length > 3 ? " and more" : ""}</p>
      <span>{songs.length} tracks · {formatTime(songs.reduce((sum, song) => sum + (song.duration || 0), 0))}</span></div></div>
    <div className="dailyMixActions">
      <button type="button" className="heroMain" disabled={!ids.length} onClick={() => actions.playSongs(ids, mix.name)}><Play size={15} />Play mix</button>
      <button type="button" className="softButton" disabled={!ids.length} onClick={() => actions.queueSongs(ids, mix.name)}><Plus size={15} />Queue</button>
      <button type="button" className="softButton" aria-expanded={expanded} aria-controls={previewId} onClick={() => setExpanded((value) => !value)}><ChevronDown size={15} />{expanded ? "Hide tracks" : "View & save"}</button>
    </div>
    {expanded ? <div id={previewId} className="dailyMixPreview">
      <form className="dailyMixSave" onSubmit={(event) => { event.preventDefault(); if (actions.savePlaylist(name, ids)) setSaved(true); }}>
        <label htmlFor={`mix-name-${mix.id}`}>Playlist name</label><input id={`mix-name-${mix.id}`} value={name} maxLength={110} onChange={(event) => { setName(event.target.value); setSaved(false); }} />
        <button type="submit" className="softButton" disabled={!ids.length || saved}><Save size={15} />{saved ? "Saved to playlists" : "Save playlist"}</button>
        {saved ? <span role="status">Saved as an editable playlist.</span> : null}
      </form>
      <ol className="dailyMixTracks">{songs.map((song) => <li key={song.id} data-current={actions.currentId === song.id}><div><strong>{prettyTitle(song.title)}</strong><span>{prettyMeta(song.artist)}</span></div>
        <button type="button" className="softButton" aria-label={`Play ${song.title}`} onClick={() => void actions.selectSong(song.id, true)}><Play size={14} /></button>
        <button type="button" className="softButton" aria-label={`Queue ${song.title}`} onClick={() => actions.queueSong(song.id)}><Plus size={14} /></button>
      </li>)}</ol>
    </div> : null}
  </article>;
}
